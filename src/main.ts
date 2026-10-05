import { loadConfig, env } from "./config.js";
import { registry } from "./sources/index.js";
import { keep } from "./filter.js";
import { rank } from "./ranking.js";
import { resolveApplyUrls } from "./resolve.js";
import { loadSeen, saveSent, dueReminders, markReminded, readHealth, writeHealth, readPrefs, writeState } from "./store.js";
import { updateHealth, type SourceResult } from "./health.js";
import { pollCommands } from "./telegram-commands.js";
import { weeklyDue, buildWeekly } from "./weekly.js";
import { formatDigest, formatTelegram } from "./delivery/format.js";
import { sendTelegram } from "./delivery/telegram.js";
import { sendEmail } from "./delivery/email.js";
import type { Opportunity, RawOpp } from "./schema.js";

const ORDER = ["job", "freelance", "bounty", "hackathon", "grant", "other"];

/** Best N overall, capped per type so the digest stays varied; roles are listed first. */
function pickTop(ranked: Opportunity[], n: number, caps: Record<string, number>): Opportunity[] {
  const count: Record<string, number> = {};
  const out: Opportunity[] = [];
  for (const o of ranked) {
    if ((count[o.type] ?? 0) >= (caps[o.type] ?? n)) continue;
    count[o.type] = (count[o.type] ?? 0) + 1;
    out.push(o);
    if (out.length === n) break;
  }
  return out.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || b.score - a.score);
}

const dry = process.argv.includes("--dry-run");
const tgReady = !!(env.tgToken && env.tgChat);

async function main() {
  const cfg = loadConfig();
  const now = new Date();

  // 1. owner commands (/mute, /boost) sent to the bot since the last run
  const prefs = !dry && tgReady ? await pollCommands(env.tgToken!, env.tgChat!).catch((e) => { console.error("commands:", e.message); return readPrefs(); }) : readPrefs();

  // 2. fetch
  const active = Object.entries(registry).filter(([k]) => cfg.sources[k]);
  const results = await Promise.allSettled(active.map(([, s]) => s.fetch()));
  const raw: RawOpp[] = [];
  const report: SourceResult[] = [];
  results.forEach((r, i) => {
    const name = active[i][1].name;
    if (r.status === "fulfilled") { raw.push(...r.value); report.push({ name, count: r.value.length }); console.log(`${name}: ${r.value.length} items`); }
    else { report.push({ name, error: String(r.reason?.message ?? r.reason) }); console.error(`${name} FAILED: ${r.reason}`); }
  });
  if (!raw.length && report.every((r) => r.error)) throw new Error("All sources failed");

  // 3. source health (alerts once per outage, and once on recovery)
  const { health, alerts } = updateHealth(readHealth(), report, now);

  // 4. filter, rank, pick
  const seen = loadSeen(now);
  const unique = [...new Map(raw.map((o) => [`${o.source}|${o.title.toLowerCase().trim()}`, o])).values()];
  const candidates = unique.filter((o) => keep(o, cfg, seen, now, prefs));
  const items = pickTop(rank(candidates, cfg.profile, now, prefs).filter((o) => o.score >= cfg.digest.minScore), cfg.digest.maxResults, cfg.digest.maxPerType);
  console.log(`${raw.length} fetched → ${candidates.length} after filter → ${items.length} delivered`);

  await resolveApplyUrls(items);
  console.log(`${items.filter((o) => o.applyUrl).length}/${items.length} have a direct apply link`);

  // 5. last-call reminders + weekly summary
  const reminders = dueReminders(now);
  const weekKey = weeklyDue(now);

  if (dry) {
    console.log("\n" + formatDigest(items, [], now, reminders));
    if (weekKey || process.argv.includes("--weekly")) console.log("\n" + buildWeekly(now).replace(/<[^>]+>/g, ""));
    if (alerts.length) console.log("\nALERTS:\n" + alerts.join("\n"));
    return;
  }

  // 6. deliver
  const sendDigest = items.length || reminders.length || cfg.digest.sendWhenEmpty;
  let delivered = false;
  if (tgReady) {
    if (sendDigest) await sendTelegram(env.tgToken!, env.tgChat!, formatTelegram(items, [], now, reminders));
    if (weekKey) await sendTelegram(env.tgToken!, env.tgChat!, buildWeekly(now));
    for (const a of alerts) await sendTelegram(env.tgToken!, env.tgChat!, a);
    delivered = true;
  }
  if (env.gmailUser && env.gmailPass && env.emailTo && sendDigest) {
    await sendEmail(env.gmailUser, env.gmailPass, env.emailTo, "New Opportunities", formatDigest(items, [], now, reminders));
    delivered = true;
  }
  if (!delivered) throw new Error("No delivery channel configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");

  // 7. persist only after successful delivery
  if (items.length) saveSent(items, now);
  markReminded(reminders.map((r) => r.id));
  writeHealth(health);
  writeState({ ...(items.length ? { lastSent: now.toISOString() } : {}), ...(weekKey ? { lastWeekly: weekKey } : {}) });
}

main().catch((e) => { console.error(e); process.exit(1); });
