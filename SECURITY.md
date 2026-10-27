# How CodeCompass keeps every user's data separate and safe

CodeCompass is a public app: anyone with the link can create an account. Each account is completely independent.

## Accounts and sign-in

- **Email code (default, free):** the person enters their email; the server emails a 6-digit code. Codes expire after 10 minutes and work once. After 5 wrong tries the code is cancelled. One email can request a code every 60 seconds and at most 5 per hour; one network can request at most 20 per hour. Only a keyed hash (HMAC) of each code is stored, never the code itself.
- A correct code returns a short-lived Firebase sign-in token for that email's account. The account is created on first sign-in. The same email always opens the same account; a different email is always a different account.
- **Google sign-in (optional, free)** always shows the account chooser.
- **SMS code (optional, paid)** can be enabled later.
- CodeCompass has no passwords of its own and never asks for passwords to LinkedIn, GitHub or coding platforms.
- “Keep me signed in on this device” can be turned off; the session then ends when the browser closes.

## Separation between users (server-enforced)

- Each account has a permanent random id (uid). Its data lives only at `users/{uid}/records/...` in Firestore.
- `firestore.rules` allows a signed-in person to read and write **only their own uid's path**. Other signed-in users and signed-out visitors are refused by Google's servers. Every other collection, including the sign-in code records, is closed to all browsers.
- The rules also check every record's shape: known tables, matching ids, no extra fields, server-set timestamps.
- Emails stay in Firebase Authentication; they are not copied into the data.

## Separation on one device

- Each account gets its own database inside the browser (`codecompass-u-<uid>`) and its own queue of pending changes. Signing in as someone else swaps everything; nothing merges.
- Signing out offers “Also remove my data from this browser” (on by default). It refuses if any change hasn't reached the cloud yet, so nothing is lost.
- Data from the older device-only version is never merged automatically; the person signing in is asked whether it's theirs.
- Demo data is separate from all accounts.

Limit: anyone using a device while you're still signed in can see your data, as with any website. Sign out on shared devices.

## No data loss

- Changes save on the device first (works offline), are marked unsynced in the same step, and are uploaded when online. The mark clears only after the cloud confirms, so a closed tab or lost connection doesn't drop anything.
- Deletes are queued and uploaded so the person's other devices remove the record too.
- Edits on two devices: the latest edit wins per record; an unsynced newer edit is never overwritten by an older cloud copy.
- Signing in on a new device downloads everything.
- Anyone can download a JSON backup of their own data from Settings.
- Account deletion requires a recent sign-in, then removes that person's cloud data, local copy and account.

## Coding-platform connections

- Profiles store only a public username and link, inside the person's private space.
- GitHub activity comes from GitHub's public API using that public username; no tokens are stored.
- LinkedIn and other platforms are links only; nothing signs in to them.

## Secrets

- Server secrets (service account, OTP secret, SMTP password) exist only as Vercel environment variables and are never sent to browsers or put in backups.
- The Firebase web config (API key etc.) is public by design.
- No analytics or tracking. Imported files and notes are always shown as plain text.
