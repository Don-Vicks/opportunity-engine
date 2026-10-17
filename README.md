# Opportunity Engine

Daily Telegram digest of hackathons, bounties, freelance gigs and jobs ranked against your profile. TypeScript, runs free on GitHub Actions.

## Local
```bash
npm install
npm run dry      # fetch + rank, print digest, send nothing
npm test
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... npm start -- --force
```

## Setup
1. Telegram: message **@BotFather** → `/newbot` → copy the token. Send your bot any message (e.g. `/start`), then run `TELEGRAM_BOT_TOKEN=<token> npm run chat-id` to print your chat ID.
2. Push this repo to GitHub (private is fine).
3. Repo → Settings → Secrets and variables → Actions: add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
   Optional email: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google app password), `EMAIL_TO`.
4. Actions tab → **daily-digest** → Run workflow to test. Cron runs every 3 hours; only new items are sent.

## Set up email applications (`/apply`, `/send`)
There are three ways to send, picked automatically in this order. You can run more than one setup; `/apply` shows a **Send** command if a sender exists and always offers the **Open in Gmail** link as well.

| Sender | Setup | Can it read your mail? | Resume |
|---|---|---|---|
| **Gmail API, send-only** (recommended) | Part 2 below | No (send permission only) | attached as a PDF |
| **App password** (SMTP) | Part 3 below | Yes (full mailbox) | attached as a PDF |
| **Open in Gmail link** | nothing | No | a "Resume: <link>" line is added (Gmail links cannot attach files) |

### Part 1: always (all three)
1. **Make the repo private:** repo → Settings → General → Danger Zone → *Change repository visibility* → Private. `/apply` and `/send` refuse to run while it is public, because drafts and your application log are committed to `data/`.
2. Check `apply.resumeUrl` in `config.yaml` points to your public resume PDF, and set `apply.replyTo` if replies should go to another address.

### Part 2: Gmail API, send-only (recommended)
1. Go to <https://console.cloud.google.com/> → create a project (e.g. `opportunity-engine`).
2. **APIs & Services → Library →** search *Gmail API* → **Enable**.
3. **APIs & Services → OAuth consent screen:** choose **External**, fill the app name and your email, and under **Scopes** add only `.../auth/gmail.send`. Under **Test users** add the Gmail address you will send from.
4. **Publish the app** (OAuth consent screen → *Publish app* → *In production*). Without this, Google expires the token after 7 days. Google will show an "unverified app" warning once when you approve; that is expected for a personal app. Click *Advanced → Go to opportunity-engine*.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID →** type **Desktop app**. Copy the client ID and client secret.
6. On **your own computer** (needs Node 22): clone the repo, `npm ci`, then run
   `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run gmail-auth`
   Open the printed URL, sign in, approve *Send email on your behalf*. The terminal prints a refresh token.
7. Add four repo secrets (Settings → Secrets and variables → Actions): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (from step 6), and `GMAIL_USER` (the sending address). Never commit these.
8. **Revoke any time:** <https://myaccount.google.com/permissions> → opportunity-engine → *Remove access*. If sending later fails with "token expired or revoked", repeat step 6 and update `GOOGLE_REFRESH_TOKEN`.

### Part 3: app password (simpler, broader access)
1. Turn on 2-Step Verification for the Google account, then Google Account → Security → 2-Step Verification → **App passwords** → create one named `opportunity-engine` and copy the 16 characters (shown once).
2. Add repo secrets `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Prefer a dedicated applications account: an app password can read and send everything in its mailbox. Delete the app password in your Google account to revoke it.

### Using it
Run the **telegram-commands** workflow once (Actions tab → Run workflow), then on a card marked `✉️ Email-ready` send `/apply <n>`. Read the preview, then `/send <code>` (or tap *Open in Gmail* and later `/sent <code>`).

## Configure
Edit `config.yaml`: skills, types, per-type minimums, remote-only, max results, min score, source flags.

## Add a source
Create `src/sources/foo.ts` exporting a `Source` (`name`, `fetch(): Promise<RawOpp[]>`), register it in `src/sources/index.ts`, add `foo: true` to `config.yaml`.

## Files
- `data/seen.json` dedupe (entries expire after 120 days), `data/history.jsonl` log of everything sent, `data/state.json` last send. Committed back by the workflow.

## Scoring
`0.4·skills + 0.3·compensation + 0.2·urgency + 0.1·effort`. Unknown amounts score a neutral 0.3. At most half the digest is any one type.

RemoteOK's API terms require linking back to remoteok.com when displaying their listings; links in the digest point there.

## Sources
RemoteOK, We Work Remotely, Remotive, Himalayas, Working Nomads, Jobicy, HN "Who is hiring?", Mastodon hashtags, Reddit r/forhire (jobs); Devpost, Devfolio (online hackathons), Superteam Earn (bounties/projects), Superteam Grants and a curated monthly list of standing grant programmes (Solana Foundation, Ethereum ESP, Web3 Foundation, Optimism, NLnet) — edit `src/sources/evergreen.ts` to add programmes.
Listings link back to the original source (required by RemoteOK/Remotive/Jobicy terms).

**Region filter:** with `regionFilter: true`, roles restricted to specific countries/regions (US only, Europe only, etc.) are dropped. Only worldwide, Africa, EMEA, WAT-friendly timezones, or unrestricted listings pass.

**LinkedIn:** deliberately not scraped. It prohibits automated scraping and blocks datacenter IPs, so it would fail on GitHub Actions. Use LinkedIn's own job alerts instead.

**Direct apply links:** where possible the digest links straight to the employer/ATS (Greenhouse, Lever, Ashby, Notion forms, company careers pages) and keeps a small "via <source>" link for attribution. Found by (1) scanning each listing's own description, (2) following Working Nomads' redirect, (3) reading Remotive's page. WWR, Himalayas, Jobicy and RemoteOK block bots or apply via JavaScript, so those fall back to the listing link.

**X / Twitter:** not supported. Its API has no free read access and scraping violates its terms and is blocked. Mastodon hashtag feeds (#hiring etc.) are the open substitute. To watch X yourself, create an X List of hiring accounts and turn on notifications.

## Automation extras
- **⏰ Last call:** anything already sent whose deadline is within 48h (and was sent >12h ago) is re-surfaced once, at the top of the next message.
- **🩺 Source health:** if a source fails 3 runs in a row or returns nothing for ~24h you get one alert (and one "back" message on recovery). State in `data/health.json`.
- **📊 Weekly summary:** Mondays after 08:00 WAT — counts by type, best sources, top picks, deadlines in the next 7 days.
- **Tune from Telegram** (only your chat is obeyed; applied on the next run, ≤3h):
  `/mute <word>` · `/unmute <word>` · `/boost <word>` · `/unboost <word>` · `/prefs` · `/help`. Stored in `data/prefs.json`.
- **Application help:** `/pitch <n>` (short pitch + which projects to lead with + biggest gap) and `/letter <n>` (cover letter) for item `n` of the latest digest (numbers run 1..N across sections). Needs `GROQ_API_KEY` or `OPENROUTER_API_KEY`. Answered on the next run (≤3h); run **daily-digest** manually for an instant reply. Drafts use only the facts in `config.yaml → portfolio`.
- **Apply from Telegram:** `/apply <n>` drafts an email application (letter + your resume PDF) for item `n` and shows the exact text; `/send <code>` sends it from your Gmail; `/cancel <code>` discards it. Only listings that contain an email address qualify (cards show `✉️ Email-ready`). For form/ATS listings use `/letter <n>`, apply yourself, then `/applied <n>`. Limits: `apply.dailyCap` per 24h, never twice to the same listing or company domain within 30 days. Needs `GMAIL_USER` + `GMAIL_APP_PASSWORD`, and `apply.resumeUrl` in `config.yaml`.
- **Tracker:** `/apps`, `/stats`, `/replied|/interview|/rejected|/offer <id>` (ids like `A3`). Stored in `data/applications.json`; the weekly summary includes the funnel. Keep the repo **private**: it contains your applications.
- **Command speed:** the `telegram-commands` workflow reads commands every 30 minutes (the digest still runs every 3h).
- Preview locally: `npm run dry` (add `-- --weekly` to see the summary).
