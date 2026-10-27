import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { codeEmail, type AccountIssuer, type Mailer, type OtpDeps, type OtpStore } from './emailOtp.js';

/**
 * Production wiring, configured only through server environment variables
 * (Vercel → Settings → Environment Variables). None of these reach the browser.
 *
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY   service account
 *   OTP_SECRET                     ≥32 random characters
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM              any SMTP service
 *   APP_NAME (optional)
 *
 * Local development may set OTP_STORE=memory and OTP_MAIL=console.
 */

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  // With the Auth emulator, no real credentials are needed.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && !process.env.FIREBASE_PRIVATE_KEY) return initializeApp({ projectId });
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase service account env vars are missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** Firestore collections otpChallenges/otpIps, readable only by the server (rules deny all clients). */
export function firestoreStore(): OtpStore {
  const db = getFirestore(adminApp());
  return {
    async transact(collection, id, fn) {
      const ref = db.collection(collection).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const next = fn(snap.exists ? (snap.data() as never) : null);
        if (next === null) tx.delete(ref);
        // `expireAt` lets an optional Firestore TTL policy clean old records.
        else tx.set(ref, { ...next, expireAt: new Date(Date.now() + 2 * 3_600_000) });
        return next;
      });
    }
  };
}

/** In-memory store for local development and tests only. */
export function memoryStore(): OtpStore {
  const data = new Map<string, unknown>();
  return {
    async transact(collection, id, fn) {
      const k = `${collection}/${id}`;
      const next = fn((data.get(k) as never) ?? null);
      if (next === null) data.delete(k);
      else data.set(k, next);
      return next;
    }
  };
}

export function smtpMailer(appName: string): Mailer {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error('SMTP env vars are missing.');
  const port = Number(SMTP_PORT || 587);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return {
    async sendCode(to, code) {
      const m = codeEmail(appName, code);
      await transport.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject: m.subject, text: m.text, html: m.html });
    }
  };
}

/** Dev only: prints the code to the server console instead of emailing it. */
export function consoleMailer(): Mailer {
  return {
    async sendCode(to, code) {
      console.log(`[dev] sign-in code for ${to}: ${code}`);
    }
  };
}

export function firebaseIssuer(): AccountIssuer {
  const auth = getAuth(adminApp());
  return {
    async tokenForEmail(email) {
      let uid: string;
      try {
        uid = (await auth.getUserByEmail(email)).uid;
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
        uid = (await auth.createUser({ email, emailVerified: true })).uid;
      }
      return auth.createCustomToken(uid, { signInMethod: 'emailOtp' });
    }
  };
}

let cached: OtpDeps | null = null;
export function productionDeps(): OtpDeps {
  if (cached) return cached;
  const appName = process.env.APP_NAME || 'CodeCompass';
  cached = {
    store: process.env.OTP_STORE === 'memory' ? memoryStore() : firestoreStore(),
    mailer: process.env.OTP_MAIL === 'console' ? consoleMailer() : smtpMailer(appName),
    issuer: firebaseIssuer(),
    secret: process.env.OTP_SECRET ?? ''
  };
  return cached;
}
