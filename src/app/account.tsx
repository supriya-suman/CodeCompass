import type { ConfirmationResult, User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { accountsConfigured, getFirebase } from '../lib/cloud/firebase';
import { destroyDb } from '../lib/db';
import type { SyncStatus } from '../lib/sync/engine';
import { openSession, type Session } from './session';

export type AccountStatus = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn';

export interface AccountCtx {
  status: AccountStatus;
  uid: string | null;
  phone: string | null;
  /** What the person signed in with, for display: phone number or email. */
  identity: string | null;
  session: Session | null;
  sync: SyncStatus | null;
  signInWithGoogle: () => Promise<void>;
  /** Email one-time code: returns seconds until a resend is allowed. */
  sendEmailCode: (email: string) => Promise<number>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  setKeepSignedIn: (keep: boolean) => Promise<void>;
  startSignIn: (phoneE164: string, keepSignedIn: boolean, recaptchaEl: HTMLElement) => Promise<void>;
  confirmCode: (code: string) => Promise<void>;
  codeSent: boolean;
  resetSignIn: () => void;
  signOut: (opts: { removeLocalData: boolean }) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<AccountCtx | null>(null);

/** Human-readable messages for Firebase Auth error codes. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number': 'That phone number doesn’t look right. Check the country code and digits.',
    'auth/missing-phone-number': 'Enter your mobile number.',
    'auth/too-many-requests': 'Too many attempts from this device. Wait a while and try again.',
    'auth/quota-exceeded': 'The SMS limit for this app has been reached. Try again later.',
    'auth/invalid-verification-code': 'That code is incorrect. Check the SMS and try again.',
    'auth/code-expired': 'That code has expired. Request a new one.',
    'auth/missing-verification-code': 'Enter the 6-digit code from the SMS.',
    'auth/captcha-check-failed': 'The security check failed. Reload the page and try again.',
    'auth/operation-not-allowed': 'Phone sign-in isn’t enabled for this app yet (Firebase console → Authentication → Sign-in method → Phone).',
    'auth/billing-not-enabled': 'Phone sign-in needs billing enabled on the Firebase project (Blaze plan).',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/requires-recent-login': 'For your security, sign in again, then retry.',
    'auth/popup-closed-by-user': 'The Google window was closed before sign-in finished. Try again.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled. Try again.',
    'auth/account-exists-with-different-credential': 'This email is already linked to another sign-in method.',
    'auth/unauthorized-domain': 'This website address isn’t allowed to sign in yet (Firebase console → Authentication → Settings → Authorized domains).'
  };
  return map[code] ?? (e instanceof Error ? e.message : 'Something went wrong. Try again.');
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(accountsConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [verifier, setVerifier] = useState<{ clear: () => void } | null>(null);

  useEffect(() => {
    if (!accountsConfigured) return;
    let unsub = () => {};
    let cancelled = false;
    getFirebase().then(async ({ auth }) => {
      const mod = await import('firebase/auth');
      const { onAuthStateChanged, getRedirectResult } = mod;
      if (cancelled) return;
      ready.current = { auth, mod };
      // Completes a Google redirect sign-in, if one was in progress.
      getRedirectResult(auth).catch(() => undefined);
      unsub = onAuthStateChanged(auth, async (u) => {
        if (!u) {
          setSession((prev) => {
            prev?.dispose();
            return null;
          });
          setUser(null);
          setSync(null);
          setStatus('signedOut');
          return;
        }
        const s = await openSession(u.uid);
        setUser(u);
        setSession(s);
        setStatus('signedIn');
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => (session ? session.engine.onStatus(setSync) : undefined), [session]);

  // Firebase Auth module and instance, kept ready so the Google popup can open
  // in the same tick as the click (browsers block popups opened after an await).
  const ready = useRef<{ auth: import('firebase/auth').Auth; mod: typeof import('firebase/auth') } | null>(null);

  const setKeepSignedIn = useCallback(async (keep: boolean) => {
    const r = ready.current;
    if (!r) return;
    await r.mod.setPersistence(r.auth, keep ? r.mod.indexedDBLocalPersistence : r.mod.browserSessionPersistence);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const r = ready.current;
    if (!r) throw new Error('Still loading. Try again in a moment.');
    const provider = new r.mod.GoogleAuthProvider();
    // Always show the account chooser, so on a shared computer the next
    // person isn't silently signed in as whoever used Google last.
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await r.mod.signInWithPopup(r.auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Some installed apps and in-app browsers block popups; fall back to a full-page redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await r.mod.signInWithRedirect(r.auth, provider);
        return;
      }
      throw e;
    }
  }, []);

  const sendEmailCode = useCallback(async (email: string) => {
    const r = await postJson('/api/auth/email-start', { email });
    return Number(r.resendAfterSec ?? 60);
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const r = ready.current;
    if (!r) throw new Error('Still loading. Try again in a moment.');
    const { token } = await postJson('/api/auth/email-verify', { email, code });
    await r.mod.signInWithCustomToken(r.auth, String(token));
  }, []);

  const startSignIn = useCallback(async (phoneE164: string, keepSignedIn: boolean, recaptchaEl: HTMLElement) => {
    const { auth } = await getFirebase();
    const { RecaptchaVerifier, signInWithPhoneNumber, setPersistence, indexedDBLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
    await setPersistence(auth, keepSignedIn ? indexedDBLocalPersistence : browserSessionPersistence);
    verifier?.clear();
    const v = new RecaptchaVerifier(auth, recaptchaEl, { size: 'invisible' });
    setVerifier(v);
    try {
      setConfirmation(await signInWithPhoneNumber(auth, phoneE164, v));
    } catch (e) {
      v.clear();
      setVerifier(null);
      throw e;
    }
  }, [verifier]);

  const confirmCode = useCallback(
    async (code: string) => {
      if (!confirmation) throw new Error('Request a code first.');
      await confirmation.confirm(code);
      verifier?.clear();
      setVerifier(null);
      setConfirmation(null);
    },
    [confirmation, verifier]
  );

  const resetSignIn = useCallback(() => {
    verifier?.clear();
    setVerifier(null);
    setConfirmation(null);
  }, [verifier]);

  const signOut = useCallback(
    async ({ removeLocalData }: { removeLocalData: boolean }) => {
      const { auth } = await getFirebase();
      const { signOut: fbSignOut } = await import('firebase/auth');
      const s = session;
      if (s) {
        if (removeLocalData && (await s.engine.countPending()) > 0) {
          await s.engine.pushNow();
          if ((await s.engine.countPending()) > 0) throw new Error('Some changes haven’t reached the cloud yet. Connect to the internet and try again, or sign out without removing data from this browser.');
        }
        s.dispose();
        if (removeLocalData) {
          await destroyDb(s.dbName);
          s.tombstones.clear();
        }
      }
      await fbSignOut(auth);
    },
    [session]
  );

  const deleteAccount = useCallback(async () => {
    const { auth, fs } = await getFirebase();
    const { FirestoreRemote } = await import('../lib/sync/firestoreRemote');
    const u = auth.currentUser;
    if (!u || !session) return;
    // Firebase only deletes a sign-in made in the last few minutes. Check that
    // first, so nothing is removed unless the whole deletion can complete.
    const signedInAt = new Date(u.metadata.lastSignInTime ?? 0).getTime();
    if (Date.now() - signedInAt > 4 * 60_000) throw Object.assign(new Error('recent login required'), { code: 'auth/requires-recent-login' });
    await new FirestoreRemote(fs, u.uid).deleteAll();
    session.dispose();
    await destroyDb(session.dbName);
    session.tombstones.clear();
    try {
      await u.delete();
    } catch (e) {
      // Cloud data is already gone; if Firebase wants a fresh login to remove
      // the sign-in itself, sign out and tell the person.
      const { signOut: fbSignOut } = await import('firebase/auth');
      await fbSignOut(auth);
      throw e;
    }
  }, [session]);

  const value = useMemo<AccountCtx>(
    () => ({
      status,
      uid: user?.uid ?? null,
      phone: user?.phoneNumber ?? null,
      identity: user?.phoneNumber ? maskPhone(user.phoneNumber) : user?.email ?? null,
      session,
      sync,
      signInWithGoogle,
      sendEmailCode,
      verifyEmailCode,
      setKeepSignedIn,
      startSignIn,
      confirmCode,
      codeSent: !!confirmation,
      resetSignIn,
      signOut,
      deleteAccount
    }),
    [status, user, session, sync, signInWithGoogle, sendEmailCode, verifyEmailCode, setKeepSignedIn, startSignIn, confirmCode, confirmation, resetSignIn, signOut, deleteAccount]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Error carrying how long to wait before retrying (from a 429). */
export class RetryError extends Error {
  constructor(message: string, public retryAfterSec?: number) {
    super(message);
  }
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new RetryError('No connection. Check your internet and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) throw new RetryError(String(data.error ?? `Sign-in failed (${res.status}).`), Number(data.retryAfterSec) || undefined);
  return data;
}

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount must be used inside AccountProvider');
  return v;
}

/** "+919876543210" → "+91 98••••••10". */
export function maskPhone(p: string | null) {
  if (!p) return '';
  const m = /^(\+91)(\d{2})\d{6}(\d{2})$/.exec(p);
  if (m) return `${m[1]} ${m[2]}••••••${m[3]}`;
  return p.length > 6 ? `${p.slice(0, p.length - 6)}••••${p.slice(-2)}` : p;
}
