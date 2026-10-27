import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

/**
 * Firebase is optional at build time. With no VITE_FIREBASE_* values the app
 * runs in "this device only" mode, exactly like before accounts existed.
 * All values here are public client identifiers, not secrets; security comes
 * from Firestore rules and Firebase Auth, not from hiding these.
 */
const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined
};
export const useEmulators = env.VITE_FIREBASE_USE_EMULATORS === 'true';

/**
 * Sign-in methods offered:
 *   email  — 6-digit code by email, sent by our own /api function (free SMTP)
 *   google — Google account (free on Firebase Spark)
 *   phone  — SMS code; Firebase only sends SMS on the paid Blaze plan
 * Default: email,google. Example: VITE_AUTH_METHODS=email
 */
const methods = String(env.VITE_AUTH_METHODS ?? 'email,google')
  .split(',')
  .map((m) => m.trim().toLowerCase());
export const authMethods = {
  email: methods.includes('email'),
  google: methods.includes('google'),
  phone: methods.includes('phone')
};
if (!authMethods.email && !authMethods.google && !authMethods.phone) authMethods.email = true;

export const accountsConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

let cached: Promise<{ app: FirebaseApp; auth: Auth; fs: Firestore }> | null = null;

/** Lazily loads the Firebase SDK so the app shell stays small. */
export function getFirebase() {
  if (!accountsConfigured) throw new Error('Accounts are not configured.');
  cached ??= (async () => {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
      popupRedirectResolver: authMod.browserPopupRedirectResolver
    });
    auth.languageCode = 'en';
    // Memory cache only: the local copy lives in this account's own IndexedDB
    // database, and nothing from Firestore is left behind for the next user.
    const fs = fsMod.initializeFirestore(app, { localCache: fsMod.memoryLocalCache() });
    if (useEmulators) {
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fsMod.connectFirestoreEmulator(fs, '127.0.0.1', 8080);
    }
    return { app, auth, fs };
  })();
  return cached;
}
