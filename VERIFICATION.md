# Verification — 28 Oct 2026 (activity map)

## Activity map (new)

- 6 unit tests: points from logged time, solved problems (duplicates counted once), finished tasks, GitHub events and app time from two devices; main area per day; days in the user's timezone; area and platform filters; fixed shade levels; streaks, best day and busiest weekday; Monday-first week layout.
- Browser (demo data, 1366 px light and 375 px dark): 365 squares rendered for the last 12 months; arrow keys move between days; clicking a square shows that day's breakdown; area and platform filters update the map; no page errors and no horizontal page overflow (the grid scrolls inside its card on phones).
- Time-in-app counter with a simulated clock: 10 minutes with a single click counted 2 active minutes (idle time ignored); continued interaction added to it; data saved per device and day.
- Schema v3 adds the `appUsage` table; it syncs, is included in backups, and is allowed by the security rules.

## Earlier — public multi-user + email OTP

## Email-code sign-in (new)

- `api/_lib/emailOtp.ts` unit tests (8): code emailed and exchanged once; same email → same account, different email → different account; a code for one email can't open another; lock after 5 wrong tries; 10-minute expiry; 60-second resend cooldown, 5 per email per hour, 20 per network per hour; input/config validation; SMTP errors not leaked.
- **Browser end to end**: local sign-in functions (`scripts/dev-api.ts`) issuing real Firebase custom tokens through the Firebase Auth emulator, app built against the emulator. Two people on two separate devices: wrong code rejected with a clear message; resend shown as “Resend in 60s”; correct code signed in to a new empty account; the second person's account could not see the first person's question.
- Server code type-checks under Node module rules (`tsconfig.api.json`).
- **Not run here:** sending through a real Gmail/Brevo SMTP server, and the functions running on Vercel itself. Test by deploying and signing in once (SETUP-ACCOUNTS.md step 5).

## Earlier rounds

## Free-plan change

- Default sign-in is now **Google** (free on Firebase Spark). Mobile OTP is off unless `VITE_AUTH_METHODS=google,phone` is set, because Firebase SMS needs the paid Blaze plan.
- Default build: sign-in screen shows only “Continue with Google”, confirmed in the browser.
- Phone OTP with the option turned on: the full two-account test below was re-run against the Auth emulator and passed again.
- **Google sign-in itself was not exercised here**: Google's popup loads a script from apis.google.com, which this sandbox blocks. Account separation does not depend on the sign-in method (it keys off the account id) and is covered by the tests below. Test Google sign-in on your laptop with `npm run emulators` + `npm run dev:emulator`, or on your deployed site.


Run in a Linux sandbox, Node 22.23.4. Firebase JS SDK 13.1.0, firebase-tools 15.34.1.

## Ran and passed

- `npm run typecheck` — strict TypeScript, no errors (includes the rules tests' types).
- `npm test` — 5 files, 33 tests, all passing. New in this update:
  - Change tracking: create, update, put-over-existing, bulk writes and `clear()` are all captured; re-creating a deleted id cancels its pending delete.
  - Sync between two devices of one account: upload, download, edits, deletes; a new device downloads everything; offline edits wait and upload on reconnect; concurrent edits keep the newer one.
  - **Two accounts on one browser (shared laptop): no records cross between them**, locally or in their cloud spaces, and their delete queues stay separate.
  - The client cannot address another uid's space (in-memory server that mimics the rules).
  - Timezone list always includes Asia/Kolkata; phone masking.
- `npm run build` — succeeds. Firebase code is split into separate chunks and only downloaded when accounts are configured.
- `npm audit --omit=dev` — 0 vulnerabilities (after pinning `@grpc/grpc-js` ≥1.14.6 via `overrides`; it was pulled in by Firestore's Node build, not shipped to browsers).
- Headless Chromium against the **Firebase Auth emulator** (real Firebase Auth SDK, real OTP flow):
  - Sign-in screen; invalid Indian number rejected.
  - OTP sign-in as +91 98765 43210 → own empty space → added a question.
  - Sign-out with “remove my data from this browser” while the cloud was unreachable → **refused** with an explanation instead of deleting unsynced data.
  - Signed out keeping data; signed in as +91 91234 56789 → **could not see the first person's question**, saw an empty space.
  - Signed back in as the first number → question still there.
  - Separate IndexedDB databases per account confirmed.
  - Legacy data from the earlier device-only version: first person chose “It's not mine” → not merged; second person chose to move it → moved into their account, and the device-only database removed.
- Device-only mode (no Firebase config) regression: all pages render at 375 px and 1100–1366 px, light and dark, no page errors or horizontal overflow; the earlier question/timer/backup-reminder flow still passes.

## Fixed during this round

- Timezone picker showed “Africa/Abidjan” in Chrome because Chrome lists India as the legacy “Asia/Calcutta”. Affected the first ZIP too. Fixed and tested.
- Cloud uploads now time out after 15 seconds on a dead connection instead of waiting forever; unsynced changes stay queued.

## Not verified here

- **Firestore security rules were not executed.** The Firestore emulator (a Java download from Google Storage) is blocked in this sandbox. `tests-rules/firestore.rules.test.ts` is written and type-checks; run `npm run test:rules` on your machine before going live.
- **Real cloud sync against Firestore** was not exercised end to end (same reason). The sync engine was tested against an in-memory stand-in.
- Real SMS delivery, reCAPTCHA on a live domain, Blaze billing and the SMS region policy need your Firebase project.
- PWA install on real phones, screen readers, and a Vercel deployment were not tested.
- `npm audit` including dev tools reports 5 moderate advisories inside `firebase-tools` (emulator CLI, not shipped).

## Known limitations

- Conflicts resolve per record by the most recent edit (device clock). Two devices editing different fields of the same question at the same moment keep only the later edit.
- Sync runs while the app is open; browsers don't run it in the background when closed.
- Phone OTP costs money per SMS (Blaze plan), so it is off by default.
- Vercel Hobby is free for personal, non-commercial use only.
- Discover, Research and Portfolio are still placeholders.
