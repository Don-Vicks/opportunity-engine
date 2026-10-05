import { loadConfig, env } from "./config.js";
import { registry } from "./sources/index.js";
import { keep } from "./filter.js";
import { rank } from "./ranking.js";
import { loadSeen, saveSent } from "./store.js";
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
const force = process.argv.includes("--force");

async function main() {
  const cfg = loadConfig();
  const now = new Date();

  const active = Object.entries(registry).filter(([k]) => cfg.sources[k]);
  const results = await Promise.allSettled(active.map(([, s]) => s.fetch()));
  const raw: RawOpp[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    const name = active[i][1].name;
    if (r.status === "fulfilled") { raw.push(...r.value); console.log(`${name}: ${r.value.length} items`); }
    else { errors.push(name); console.error(`${name} FAILED: ${r.reason}`); }
  });

  if (!raw.length && errors.length === active.length) throw new Error("All sources failed");
  const seen = loadSeen(now);
  const unique = [...new Map(raw.map((o) => [`${o.source}|${o.title.toLowerCase().trim()}`, o])).values()];
  const candidates = unique.filter((o) => keep(o, cfg, seen, now));
  const items = pickTop(rank(candidates, cfg.profile, now).filter((o) => o.score >= cfg.digest.minScore), cfg.digest.maxResults, cfg.digest.maxPerType);
  console.log(`${raw.length} fetched → ${candidates.length} after filter → ${items.length} delivered`);

  const message = formatDigest(items, errors, now);
  if (dry) { console.log("\n" + message); return; }
  if (!items.length && !cfg.digest.sendWhenEmpty) { console.log("Nothing new; staying quiet."); return; }

  let delivered = false;
  if (env.tgToken && env.tgChat) { await sendTelegram(env.tgToken, env.tgChat, formatTelegram(items, errors, now)); delivered = true; }
  if (env.gmailUser && env.gmailPass && env.emailTo) {
    await sendEmail(env.gmailUser, env.gmailPass, env.emailTo, "Daily Opportunities", message);
    delivered = true;
  }
  if (!delivered) throw new Error("No delivery channel configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
  saveSent(items, now);
}

main().catch((e) => { console.error(e); process.exit(1); });
