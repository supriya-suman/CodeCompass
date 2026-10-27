# From ZIP to an app on your phone — every step

About 45 minutes the first time. Everything is free. Do the steps in order.

## A. One-time installs on your laptop

1. **Node.js 22.12 or newer** — nodejs.org → download the LTS installer → install. Check in a terminal: `node -v`.
2. **Git** — git-scm.com → install. Check: `git --version`.
3. **Java 11+** (only for the optional local emulators and rules tests) — adoptium.net.
4. Accounts you need: **GitHub**, **Vercel** (sign up with GitHub), **Google** (for Firebase and for sending code emails).

## B. Open and run the project

5. Unzip `codecompass.zip`. Open the `codecompass` folder in VS Code.
6. In VS Code's terminal (Terminal → New Terminal), install the packages:
   ```bash
   npm install
   ```
7. Check that everything works:
   ```bash
   npm test
   npm run build
   ```
8. Optional quick look: `npm run dev`, then open http://localhost:5173. With no keys yet it runs in "this device only" mode. Stop it with Ctrl+C.

## C. Create the free Firebase project

9. Go to **console.firebase.google.com** → **Create a project** → name `codecompass` → turn **Google Analytics off** → Create. Stay on the free **Spark** plan; don't add billing.
10. Left menu **Build → Authentication → Get started**.
11. Optional: **Sign-in method → Google → Enable** → choose a support email → **Save**. This adds "Continue with Google".
12. **Build → Firestore Database → Create database** → **Standard** edition → location **asia-south1 (Mumbai)** → **Start in production mode** → Create.

## D. Get the Firebase keys

13. **Web app keys (public):** ⚙ **Project settings → General → Your apps → `</>` (Web)** → nickname `codecompass` → **Register app**. Don't tick Hosting. Copy the four values `apiKey`, `authDomain`, `projectId` and `appId` into a notes file.
14. **Server key (secret):** ⚙ **Project settings → Service accounts → Generate new private key → Generate key**. A `.json` file downloads. From it you need `project_id`, `client_email` and `private_key`. Never share or commit this file.
15. **OTP secret:** in the terminal, run
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
    Copy the long output.

## E. Let the app email sign-in codes (Gmail, free)

16. Pick the Gmail account that will send codes, for example a new `codecompass.app@gmail.com`.
17. **myaccount.google.com → Security → 2-Step Verification → turn on.**
18. **myaccount.google.com → Security → App passwords** (or search "App passwords") → name it `CodeCompass` → **Create**. Copy the 16-character password.

## F. Put the code on GitHub

19. On github.com → **New repository** → name `codecompass` → **Private** → Create. Don't add a README.
20. In the VS Code terminal, inside the `codecompass` folder:
    ```bash
    git init
    git add -A
    git commit -m "CodeCompass"
    git branch -M main
    git remote add origin https://github.com/<your-username>/codecompass.git
    git push -u origin main
    ```
    `.gitignore` already keeps secrets and `node_modules` out.

## G. Deploy on Vercel (free)

21. vercel.com → **Add New… → Project** → **Import** your `codecompass` repo. Vercel detects **Vite**; leave the build settings as they are.
22. Before deploying, open **Environment Variables** and add each of these:

    | Name | Value |
    | --- | --- |
    | `VITE_FIREBASE_API_KEY` | apiKey (step 13) |
    | `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
    | `VITE_FIREBASE_PROJECT_ID` | projectId |
    | `VITE_FIREBASE_APP_ID` | appId |
    | `VITE_AUTH_METHODS` | `email,google` (or `email` if you skipped step 11) |
    | `FIREBASE_PROJECT_ID` | project_id (step 14) |
    | `FIREBASE_CLIENT_EMAIL` | client_email |
    | `FIREBASE_PRIVATE_KEY` | private_key — paste the whole value from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n` |
    | `OTP_SECRET` | output of step 15 |
    | `SMTP_HOST` | `smtp.gmail.com` |
    | `SMTP_PORT` | `587` |
    | `SMTP_USER` | the Gmail address (step 16) |
    | `SMTP_PASS` | the app password (step 18), without spaces |
    | `MAIL_FROM` | `CodeCompass <the Gmail address>` |

23. Click **Deploy**. When it finishes, copy your link, e.g. `https://codecompass-xyz.vercel.app`.

## H. Connect the link to Firebase

24. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → paste your Vercel domain without `https://`, e.g. `codecompass-xyz.vercel.app`.
25. Lock down the database with the included security rules. In the VS Code terminal:
    ```bash
    npx firebase login
    npx firebase use --add        # pick your project, type "default" as the alias
    npx firebase deploy --only firestore:rules
    ```
    You should see "Deploy complete!". **Don't share the link before this step.**
26. Optional cleanup of old sign-in codes: Firestore → **TTL policies → Create policy** → collection group `otpChallenges`, timestamp field `expireAt`. Repeat with `otpIps`.

## I. Test it yourself

27. Open your Vercel link on the laptop → enter your email → **Email me a code**. The email arrives within a minute; check Spam the first time and mark it "Not spam".
28. Enter the code → you're in an empty account. Add one question.
29. Open the same link on your phone and sign in with the same email → the question is there (synced).
30. Sign in with a different email (or ask a friend) → an empty account. That person can't see your data.

## J. Install on your phone

31. **Android (Chrome):** open the link → menu **⋮ → Install app** (or **Add to Home screen**) → **Install**. CodeCompass appears with its icon and opens full screen.
32. **iPhone / iPad (Safari):** open the link → **Share** button → **Add to Home Screen** → **Add**.
33. **Desktop (Chrome or Edge):** click the install icon at the right of the address bar, or **Settings & data → Install app** inside CodeCompass.

## K. Share it

34. Send the Vercel link to anyone. Each person installs it from their own browser and signs in with their own email. They each get a separate account.

## L. Updating later

35. Change the code, then:
    ```bash
    npm test
    git add -A
    git commit -m "Describe the change"
    git push
    ```
    Vercel redeploys automatically. Installed apps show "A new version is ready — Reload to update".

## Troubleshooting

| What you see | Fix |
| --- | --- |
| The app says accounts aren't set up | `VITE_FIREBASE_*` are missing or misspelled in Vercel → fix them → **Deployments → ⋯ → Redeploy**. |
| "Sign-in is temporarily unavailable" | A server variable is missing or wrong (usually `FIREBASE_PRIVATE_KEY` or `OTP_SECRET`). Check Vercel → your project → **Logs**. |
| "We couldn't send the email" | Wrong `SMTP_USER`/`SMTP_PASS`, or 2-Step Verification is off. Make a new app password. |
| Code email not arriving | Look in Spam. Gmail allows about 500 emails a day. For more users, switch to Brevo (SETUP-ACCOUNTS.md). |
| "This website address isn't allowed to sign in" | Do step 24 for your exact domain. |
| Saving shows "Sync problem" | Do step 25 (rules), and check that the Firestore database exists. |
| Google button does nothing on an installed iPhone app | Use the email code, or set up the sign-in proxy in SETUP-ACCOUNTS.md. |

Limits on the free plans: Vercel Hobby is for non-commercial use. Firestore's free daily quota is shared by all users; a few hundred active people a day fit comfortably.
