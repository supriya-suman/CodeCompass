import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Email one-time-code sign-in. Framework-free so it can be unit tested and
 * run on Vercel or a local dev server.
 *
 * Flow:
 *   start(email)        → emails a 6-digit code, valid 10 minutes
 *   verify(email, code) → returns a Firebase custom token for that email's account
 *
 * The code itself is never stored, only an HMAC of it. Each code allows 5
 * attempts. Sending is rate limited per email and per IP address.
 */

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_EMAIL_PER_HOUR = 5;
export const MAX_SENDS_PER_IP_PER_HOUR = 20;
const HOUR = 3_600_000;

export interface ChallengeRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  sends: number[]; // timestamps of recent sends
}
export interface IpRecord {
  sends: number[];
}

/** Server-only storage (Firestore via Admin SDK in production). */
export interface OtpStore {
  /** Atomically read-modify-write one document. Return null from fn to delete it. */
  transact<T>(collection: 'otpChallenges' | 'otpIps', id: string, fn: (current: T | null) => T | null): Promise<T | null>;
}

export interface Mailer {
  sendCode(to: string, code: string): Promise<void>;
}

export interface AccountIssuer {
  /** Find or create the account for a verified email and return a sign-in token. */
  tokenForEmail(email: string): Promise<string>;
}

export interface OtpDeps {
  store: OtpStore;
  mailer: Mailer;
  issuer: AccountIssuer;
  secret: string;
  now?: () => number;
  makeCode?: () => string;
}

export type OtpResult =
  | { status: 200; body: { ok: true; resendAfterSec?: number; token?: string } }
  | { status: 400 | 429 | 500 | 502; body: { ok: false; error: string; retryAfterSec?: number } };

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,63}$/i;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('hex');

export function emailKey(email: string) {
  return sha256(`email:${email}`);
}
export function ipKey(ip: string) {
  return sha256(`ip:${ip}`);
}

const fail = (status: 400 | 429 | 500 | 502, error: string, retryAfterSec?: number): OtpResult => ({ status, body: { ok: false, error, ...(retryAfterSec ? { retryAfterSec } : {}) } });

export async function startEmailOtp(deps: OtpDeps, rawEmail: unknown, ip: string): Promise<OtpResult> {
  if (!deps.secret || deps.secret.length < 32) return fail(500, 'Sign-in is not configured on the server.');
  const email = normaliseEmail(rawEmail);
  if (!email) return fail(400, 'Enter a valid email address.');
  const now = (deps.now ?? Date.now)();

  // Per-IP limit (stops one machine spamming many addresses).
  let ipBlocked = 0;
  await deps.store.transact<IpRecord>('otpIps', ipKey(ip || 'unknown'), (cur) => {
    const sends = (cur?.sends ?? []).filter((t) => now - t < HOUR);
    if (sends.length >= MAX_SENDS_PER_IP_PER_HOUR) {
      ipBlocked = Math.ceil((sends[0] + HOUR - now) / 1000);
      return { sends };
    }
    return { sends: [...sends, now] };
  });
  if (ipBlocked) return fail(429, 'Too many codes requested from this network. Try again later.', ipBlocked);

  const code = (deps.makeCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0')))();
  let retry = 0;
  await deps.store.transact<ChallengeRecord>('otpChallenges', emailKey(email), (cur) => {
    const sends = (cur?.sends ?? []).filter((t) => now - t < HOUR);
    const last = sends.at(-1);
    if (last && now - last < RESEND_COOLDOWN_MS) {
      retry = Math.ceil((last + RESEND_COOLDOWN_MS - now) / 1000);
      return cur;
    }
    if (sends.length >= MAX_SENDS_PER_EMAIL_PER_HOUR) {
      retry = Math.ceil((sends[0] + HOUR - now) / 1000);
      return cur;
    }
    // A new code replaces any earlier one and resets attempts.
    return { codeHash: hmac(deps.secret, `${email}:${code}`), expiresAt: now + CODE_TTL_MS, attempts: 0, sends: [...sends, now] };
  });
  if (retry) return fail(429, `Please wait before requesting another code.`, retry);

  try {
    await deps.mailer.sendCode(email, code);
  } catch {
    return fail(502, 'We couldn’t send the email right now. Try again in a minute.');
  }
  return { status: 200, body: { ok: true, resendAfterSec: RESEND_COOLDOWN_MS / 1000 } };
}

export async function verifyEmailOtp(deps: OtpDeps, rawEmail: unknown, rawCode: unknown): Promise<OtpResult> {
  if (!deps.secret || deps.secret.length < 32) return fail(500, 'Sign-in is not configured on the server.');
  const email = normaliseEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) return fail(400, 'Enter the 6-digit code from the email.');
  const now = (deps.now ?? Date.now)();
  const expected = Buffer.from(hmac(deps.secret, `${email}:${code}`), 'hex');

  let outcome: 'ok' | 'wrong' | 'expired' | 'locked' = 'expired';
  await deps.store.transact<ChallengeRecord>('otpChallenges', emailKey(email), (cur) => {
    if (!cur || !cur.codeHash || now > cur.expiresAt) {
      outcome = 'expired';
      return cur ? { ...cur, codeHash: '', attempts: 0 } : null;
    }
    if (cur.attempts >= MAX_ATTEMPTS) {
      outcome = 'locked';
      return { ...cur, codeHash: '' };
    }
    const got = Buffer.from(cur.codeHash, 'hex');
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      outcome = 'ok';
      // One use only; keep send history so rate limits still apply.
      return { ...cur, codeHash: '', attempts: 0 };
    }
    outcome = 'wrong';
    const attempts = cur.attempts + 1;
    return attempts >= MAX_ATTEMPTS ? { ...cur, codeHash: '', attempts } : { ...cur, attempts };
  });

  if (outcome === 'expired') return fail(400, 'That code has expired or was already used. Request a new one.');
  if (outcome === 'locked') return fail(429, 'Too many wrong attempts. Request a new code.');
  if (outcome === 'wrong') return fail(400, 'That code is incorrect. Check the email and try again.');
  try {
    const token = await deps.issuer.tokenForEmail(email);
    return { status: 200, body: { ok: true, token } };
  } catch {
    return fail(500, 'Signed in, but the account couldn’t be opened. Try again.');
  }
}

/** Email body. Plain and short so it reads well on phones and isn't flagged as spam. */
export function codeEmail(appName: string, code: string) {
  return {
    subject: `${code} is your ${appName} sign-in code`,
    text: `Your ${appName} sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't try to sign in, you can ignore this email.`,
    html: `<p>Your ${appName} sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p><p>It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>`
  };
}
