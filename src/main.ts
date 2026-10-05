import { loadConfig, env } from "./config.js";
import { registry } from "./sources/index.js";
import { keep } from "./filter.js";
import { rank } from "./ranking.js";
import { loadSeen, saveSent, lastSent } from "./store.js";
import { formatDigest } from "./delivery/format.js";
import { sendTelegram } from "./delivery/telegram.js";
import { sendEmail } from "./delivery/email.js";
import type { Opportunity, RawOpp } from "./schema.js";

/** Top N by score, but at most ceil(N/2) of any one type so the digest stays varied. */
function pickTop(ranked: Opportunity[], n: number): Opportunity[] {
  const cap = Math.ceil(n / 2);
  const count: Record<string, number> = {};
  const out: Opportunity[] = [];
  for (const o of ranked) {
    if ((count[o.type] ?? 0) >= cap) continue;
    count[o.type] = (count[o.type] ?? 0) + 1;
    out.push(o);
    if (out.length === n) break;
  }
  return out;
}

const dry = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function main() {
  const cfg = loadConfig();
  const now = new Date();

  const last = lastSent();
  if (!force && !dry && last && (now.getTime() - last.getTime()) / 86_400_000 < cfg.digest.frequencyDays - 0.2) {
    console.log(`Skipping: last digest ${last.toISOString()}, frequency ${cfg.digest.frequencyDays}d`);
    return;
  }

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
  const unique = [...new Map(raw.map((o) => [o.id, o])).values()];
  const candidates = unique.filter((o) => keep(o, cfg, seen, now));
  const items = pickTop(rank(candidates, cfg.profile, now).filter((o) => o.score >= cfg.digest.minScore), cfg.digest.maxResults);
  console.log(`${raw.length} fetched → ${candidates.length} after filter → ${items.length} delivered`);

  const message = formatDigest(items, errors, now);
  if (dry) { console.log("\n" + message); return; }

  let delivered = false;
  if (env.tgToken && env.tgChat) { await sendTelegram(env.tgToken, env.tgChat, message); delivered = true; }
  if (env.gmailUser && env.gmailPass && env.emailTo) {
    await sendEmail(env.gmailUser, env.gmailPass, env.emailTo, "Daily Opportunities", message);
    delivered = true;
  }
  if (!delivered) throw new Error("No delivery channel configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
  saveSent(items, now);
}

main().catch((e) => { console.error(e); process.exit(1); });
