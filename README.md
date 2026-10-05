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
RemoteOK, We Work Remotely, Remotive, Himalayas, Working Nomads, Jobicy, HN "Who is hiring?", Mastodon hashtags, Reddit r/forhire (jobs); Devpost, Superteam Earn (hackathons/bounties).
Listings link back to the original source (required by RemoteOK/Remotive/Jobicy terms).

**Region filter:** with `regionFilter: true`, roles restricted to specific countries/regions (US only, Europe only, etc.) are dropped. Only worldwide, Africa, EMEA, WAT-friendly timezones, or unrestricted listings pass.

**LinkedIn:** deliberately not scraped. It prohibits automated scraping and blocks datacenter IPs, so it would fail on GitHub Actions. Use LinkedIn's own job alerts instead.

**Direct apply links:** where possible the digest links straight to the employer/ATS (Greenhouse, Lever, Ashby, Notion forms, company careers pages) and keeps a small "via <source>" link for attribution. Found by (1) scanning each listing's own description, (2) following Working Nomads' redirect, (3) reading Remotive's page. WWR, Himalayas, Jobicy and RemoteOK block bots or apply via JavaScript, so those fall back to the listing link.

**X / Twitter:** not supported. Its API has no free read access and scraping violates its terms and is blocked. Mastodon hashtag feeds (#hiring etc.) are the open substitute. To watch X yourself, create an X List of hiring accounts and turn on notifications.
