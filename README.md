# CodeCompass

A personal coding and career command centre: questions and spaced revision, learning plans, a study timer, interview and assessment tracking, coding-profile links with a working GitHub integration, backups, and an installable PWA.

**A public app for anyone:** share the hosted link; each visitor installs it on their phone or desktop and creates their own account with **their email and a 6-digit code** (free), or Google. Every account's questions, plans, interviews, time logs and coding-profile connections are private to that person, sync across their devices, and work offline. Nobody can see anyone else's data. See [SECURITY.md](SECURITY.md) and [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md).

If Firebase isn't configured, the app runs in **this device only** mode: records stay in this browser, no sign-in. No analytics in either mode.

> Status: **Phase 1–2 complete, plus public multi-user accounts (email OTP / Google) with cloud sync, backup/import and PWA.**
>
> **Cost: everything runs on free plans** — Vercel Hobby (site + sign-in functions), Firebase Spark (accounts + Firestore), Gmail or Brevo (code emails), GitHub. See the cost table in [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md). Discover, Research and Portfolio export are not built yet; their pages say so and contain no working-looking controls. See [Roadmap](#roadmap).

**Hosting it:** follow [DEPLOY-STEPS.md](DEPLOY-STEPS.md) — every step from this ZIP to an installed app on your phone.

## Quick start

Requires Node.js 22.12 or newer (Vitest 5 needs it; developed on Node 22.23).

```bash
npm install        # uses the committed package-lock.json
cp .env.example .env.local   # optional: add Firebase values to enable sign-in (SETUP-ACCOUNTS.md)
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript, no emit
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173 (service worker active here)
npm run dev:api    # sign-in functions on :3001 (npm run dev forwards /api there)
npm run emulators && npm run dev:api:emulator && npm run dev:emulator   # everything local, no accounts needed (Java 11+)
npm run test:rules # Firestore security-rules tests (needs the emulator)
```

The service worker only runs in the production build (`build` then `preview`), not in `dev`.

## What works today

| Area | Included |
| --- | --- |
| Overview | Weekly bearing dial (logged vs target), coding vs study per day, streak, next actions (revision due, tasks due/overdue, interviews in the next 7 days, follow-ups), solved stats, topic coverage, goals, GitHub activity. Every number has a “How is this calculated?” note. Empty state when nothing is recorded. |
| Activity | GitHub-style year grid: one square per day, shade = amount of focus, colour = that day's main area (coding, learning, interviews, projects/GitHub, time in CodeCompass). Filters per area and per platform (LeetCode, Codeforces, GitHub…), tap a day for its breakdown, streaks, best day, busiest weekday, area mix. Six-month preview on the overview. Keyboard navigable with text descriptions. |
| Questions | Create, edit, view, delete, search, filter by status/platform/difficulty/topic. All requested fields including code snippets, complexity, mistakes, company tags and coding sheet. Duplicate detection (normalised URL, or platform + title). CSV import with row-level errors, CSV export, template download. |
| Revision | Queue of due questions with “Forgot it / Shaky / Solved confidently”. Intervals configurable in Settings (default 1, 3, 7, 14, 30 days). |
| Learning | Goals in 8 starter areas, each with an optional original starter plan linking to official docs. Tasks, milestones, due dates, planned minutes, resource links, completion notes. List and board views. Planned vs actual time from linked timer sessions. Archive and delete (with confirmation). |
| Time | Start / pause / resume / stop timer that survives reloads, tab sleep and closing the app (timestamps, not a running counter). One active timer across tabs. Correct the duration before saving. Manual entries with overlap warnings. Link sessions to a question, learning task or interview. Daily and weekly totals by category vs weekly targets. CSV export. |
| Interviews & tests | All requested fields, preparation checklist, related study tasks, upcoming / follow-ups due / past views, overdue-status prompt. Times stored in the invite’s timezone, shown in yours. `.ics` export per item or all upcoming (UTC times + 30-minute alarm). |
| Coding profiles | Saved links for GitHub, LeetCode, GeeksforGeeks, Codeforces, CodeChef, HackerRank, AtCoder and custom platforms. GitHub fetches real public data. Support matrix shown in-app. |
| Accounts | Email OTP (free: 6-digit code, 10-minute expiry, single use, 5 tries, rate limits), Google sign-in (free), optional SMS OTP (paid, off by default); keep-signed-in choice, sync status, offline queue, sign-out with “remove my data from this browser” (refuses if anything is unsynced), account deletion, one-time “is this data yours?” prompt for data saved before accounts. |
| Settings & data | Name, timezone (default Asia/Kolkata), location (default Gurugram, Haryana, India), theme, revision intervals, weekly targets, JSON backup and validated restore (merge or replace), storage persistence request, backup reminder, demo mode, delete-all with typed confirmation, install guide. |
| PWA | Manifest, original icons (incl. maskable + Apple touch), offline app shell, update prompt, offline banner, install button where the browser supports it, iOS/Android/desktop instructions. |

## Integration support matrix

| Platform | This version | How |
| --- | --- | --- |
| LinkedIn | Link only | Not signed in to, no data read, no password ever asked. LinkedIn's sign-in shares only name/email, so it isn't used. |
| GitHub | **Automatic** (public data) | Official REST API from the browser, unauthenticated. User, public repos, recent public events. 60 requests/hour per IP, so results are cached 15 minutes; errors keep the last good data. |
| Codeforces | Manual / CSV | Has an official public API; submissions import is planned next. |
| LeetCode | Manual / CSV | No official public API. |
| GeeksforGeeks | Manual / CSV | No official public API. |
| CodeChef | Manual / CSV | API requires an approved developer account. |
| HackerRank | Manual / CSV | No public API for personal progress. |
| AtCoder | Manual / CSV | No official public API. |
| Custom | Manual / CSV | Link only. |

No platform passwords are ever requested. Nothing is scraped.

## Install on devices

The app installs from the browser; it is **not** an App Store or Play Store app.

- **iPhone / iPad:** open the deployed site in Safari → Share → Add to Home Screen.
- **Android:** Chrome → ⋮ menu → Install app (or the in-app “Install app” button in Settings).
- **Desktop:** Chrome or Edge → install icon in the address bar. Safari on macOS → File → Add to Dock. Firefox desktop doesn’t support installing web apps.

Limitations to know: with accounts, data syncs whenever the app is open and online — there are no background jobs while it's closed, and no push notifications (reminders appear in the app and via calendar export). In device-only mode nothing syncs and browsers can clear site storage, so download backups.

## Backup and restore

Settings & data → **Download backup** writes a JSON file with every table except cached GitHub responses. **Restore** validates the file first (app, schema version, required fields, duplicate ids) and shows what it contains. Choose **Add missing records** (merge by id) or **Replace everything**. A banner reminds you when your last backup is older than 14 days.

CSV: Questions page → Import CSV / Download template / Export CSV. Time page → Export CSV.

## Demo mode

Settings → **Explore demo data**. Demo records live in a separate IndexedDB database (`codecompass-demo`) and use obviously fictional company names. A banner is shown on every page. “Reset demo data” restores the sample set; your own database is never touched.

## Deploy: GitHub and Vercel

```bash
git init && git add -A && git commit -m "CodeCompass phase 1-2"
git branch -M main
git remote add origin https://github.com/<your-username>/codecompass.git
git push -u origin main
```

On vercel.com → Add New → Project → import the repo. Vercel detects Vite: build command `npm run build`, output `dist`. Add the environment variables listed in SETUP-ACCOUNTS.md: the `VITE_FIREBASE_*` web config, plus the server-only service account, `OTP_SECRET` and SMTP settings for the email-code functions in `api/`. Add your Vercel domain to Firebase's authorized domains. Without the Firebase values the deployment runs in device-only mode. `vercel.json` rewrites every non-`/api` path to `index.html` (SPA routing) and stops the service worker file being cached.

`.env.example` lists the variables. `.env.emulator` holds fake values for the local emulators only. Never commit `.env.local`.

## Change the branding

- Name: `src/app/brand.ts`, `index.html` `<title>` and Apple meta, the `manifest` block in `vite.config.ts`.
- Colours and fonts: the token block at the top of `src/index.css`.
- Icons: `public/favicon.svg` and the PNGs in `public/`.

## Architecture

```
src/
  lib/          framework-free domain logic (unit tested)
    types.ts       typed models
    db.ts          Dexie schema, versioned migrations, real/demo databases
    repo.ts        write layer (ids, timestamps)
    sync/          change tracking (Dexie hooks), sync engine, Firestore adapter
    cloud/         lazy Firebase initialisation
    time.ts        Intl-based timezone maths (no date library)
    timer.ts       timestamp-derived timer, overlap detection
    revision.ts    spaced revision
    dedupe.ts      canonical problem identity
    stats.ts       every dashboard number
    csv.ts, backup.ts, ics.ts, github.ts, demo.ts, starter.ts
  app/          account (OTP auth), per-account sessions, providers, layout, PWA hooks
firestore.rules  server-enforced per-account access
tests-rules/     security-rules tests (emulator)
  components/   accessible UI primitives and charts (no chart library)
  pages/        one lazily loaded chunk per route
```

Dependencies: React, React Router, Dexie (+ react hooks), Firebase (Auth + Firestore, loaded only when configured), Tailwind CSS, vite-plugin-pwa. Charts are hand-built SVG/CSS with visually hidden data tables for screen readers.

Security notes: all user and imported content is rendered as text (no `dangerouslySetInnerHTML`); links render only for `http(s)` URLs and open with `noopener noreferrer`; CSV export neutralises formula-like cells; no secrets exist in the client bundle.

## Verification

See `VERIFICATION.md` for what was run and what wasn’t.

## Roadmap

1. **Discover** — Codeforces contest list (official API) via a cached adapter; manual/URL entry for conferences, hackathons and CFPs with “Not provided” for unknown fields; transparent match rules (skills, Delhi NCR/online preference, dates); save/dismiss/mark applied; expired items hidden.
2. **Research** — reading list with arXiv/Crossref metadata lookup, CFP deadlines, paper ideas and submission status.
3. **Portfolio** — featured projects from GitHub, achievements, field-level public selection, preview, and a sanitised static-site export with publishing steps.
4. **Codeforces submissions import** for questions.
5. **Hardening** — App Check enforcement, optional field-level merge instead of whole-record last-write-wins.
