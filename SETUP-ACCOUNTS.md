# Publishing CodeCompass for anyone to use — free

After this setup, you share one link (for example `https://codecompass-yourname.vercel.app`). Anyone who opens it can:

1. Install it on their phone or computer (Add to Home Screen / Install app).
2. Create their own account with **their email and a 6-digit code** (or Google).
3. Keep their own questions, plans, interviews, time logs and coding-profile connections, private to them and synced across their devices.

Nobody sees anyone else's data, and you (the publisher) never handle anyone's passwords.

## What it costs: nothing

| Piece | Service | Free plan |
| --- | --- | --- |
| Website, install and sign-in functions | Vercel **Hobby** | Free for personal, non-commercial use |
| Accounts | Firebase Authentication, **Spark** plan | Free — no card on file, nothing can be billed |
| Each person's cloud data | Cloud Firestore, **Spark** plan | Free: 1 GiB, 50K reads and 20K writes per day for the whole app |
| Sending the email codes | **Gmail** with an app password, or **Brevo** | Gmail: up to 500 emails/day. Brevo: 300 emails/day, no card |

On free plans, hitting a limit pauses that service until the next day; it never charges you.

Why email codes are sent by the app itself: Firebase's built-in email sign-in is limited to 5 emails a day on the free plan, and SMS codes are paid. So a small Vercel function emails the code through your free Gmail or Brevo account, then hands the person a Firebase sign-in.

**Choosing a mail service:** Gmail is the quickest start. Google suggests a dedicated service once you have real traffic. Move to Brevo when you have many users or want the email to come from your own domain; only the SMTP settings change.

**If you ever charge money:** Vercel Hobby is non-commercial. Move to Vercel Pro, or a host that allows commercial use on its free plan (e.g. Cloudflare Pages + Workers). The app code doesn't change.

---

## 1. Firebase project (free Spark plan)

1. console.firebase.google.com → **Add project** → e.g. `codecompass`. Google Analytics: **off**. Stay on **Spark**.
2. **Build → Authentication → Get started.** That's all the email-code sign-in needs.
3. Optional, also free: **Sign-in method → Google → Enable** to show “Continue with Google”.
4. **Authentication → Settings → Authorized domains** → add your Vercel domain.

## 2. Database and security rules

1. **Build → Firestore Database → Create database**, Standard edition, location **asia-south1 (Mumbai)** or **asia-south2 (Delhi)**, **production mode**.
2. Deploy the rules from the project folder:

   ```bash
   npx firebase login
   npx firebase use --add
   npx firebase deploy --only firestore:rules
   ```

   People can then reach only `users/<their own id>/records`. The sign-in code records (`otpChallenges`, `otpIps`) are readable by the server only.

3. Optional cleanup, free: **Firestore → TTL policies → Create policy**, collection group `otpChallenges`, field `expireAt`. Repeat for `otpIps`. Old code records then delete themselves.

## 3. Keys

**Web app config (public):** Project settings → General → Your apps → **Web (</>)** → Register. Copy `apiKey`, `authDomain`, `projectId`, `appId`.

**Service account (secret):** Project settings → **Service accounts → Generate new private key**. A JSON file downloads. You need its `project_id`, `client_email` and `private_key`. Keep this file private, never commit it, and delete it after copying the values.

**OTP secret:** run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep the output.

## 4. Email sending (pick one)

**Gmail (quickest):**

1. On the Google account you'll send from, turn on **2-Step Verification**.
2. myaccount.google.com → Security → **App passwords** → create one named “CodeCompass”.
3. Use: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<that gmail address>`, `SMTP_PASS=<the 16-character app password>`, `MAIL_FROM="CodeCompass <that gmail address>"`.

**Brevo (better for many users):** create a free account, verify your sender email or domain, then use the SMTP login from **SMTP & API → SMTP**: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`. `MAIL_FROM` must be your verified sender.

## 5. Put it on Vercel

1. Push the project to GitHub, then on vercel.com → **Add New → Project** → import it. Vercel detects Vite.
2. **Settings → Environment Variables**, for Production:

   | Name | Value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | web app config |
   | `VITE_AUTH_METHODS` | `email,google` (or `email`) |
   | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | service account (paste the private key exactly, including `-----BEGIN…` and the `\n`s) |
   | `OTP_SECRET` | the random string |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | mail service |

   Only names starting with `VITE_` reach the browser. The others stay on the server.

3. **Deploy.** Open the link, sign in with your email, and check the code arrives (and isn't in spam).
4. Share the link. Each person installs it from their own browser.

## Local development

With your real project, put all the variables above in `.env.local`, then run:

```bash
npm run dev:api    # sign-in functions on :3001 (reads .env.local)
npm run dev        # app on :5173, forwards /api to :3001
```

With no accounts at all, using emulators (needs Java 11+):

```bash
npm run emulators          # Firebase Auth + Firestore emulators
npm run dev:api:emulator   # sign-in functions; codes are printed in this terminal
npm run dev:emulator       # app
npm run test:rules         # security-rules tests
```

## Optional, paid: SMS codes

Only if you choose to pay for SMS: upgrade Firebase to **Blaze**, add a budget alert, set **Authentication → Settings → SMS region policy** to India only, enable **Sign-in method → Phone**, and set `VITE_AUTH_METHODS=email,google,phone`.
