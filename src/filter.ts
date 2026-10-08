import type { Config } from "./config.js";
import type { RawOpp } from "./schema.js";
import { hasWord } from "./prefs.js";
import type { Prefs } from "./store.js";
import { overLevel } from "./seniority.js";
import { daysUntil, regionOk, looksClosed, isTechTitle, residencyBlock } from "./helpers.js";

/** Why a listing is dropped, or null if it passes. The reason is a short stable label used in run logs. */
export function rejectReason(o: RawOpp, cfg: Config, seen: Set<string>, now = new Date(), prefs?: Prefs): string | null {
  const p = cfg.profile;
  const job = o.type === "job" || o.type === "freelance";
  if (seen.has(o.id)) return "already sent";
  const title = o.title.toLowerCase();
  if (prefs?.mute.length && hasWord(title, prefs.mute)) return "muted";
  if (p.excludeKeywords.some((k) => title.includes(k.toLowerCase()))) return "excluded keyword";
  if (p.regionFilter && !regionOk(o.region)) return "region-locked";
  if (looksClosed(`${o.title} ${o.snippet}`)) return "closed/filled";
  if (!p.preferredTypes.includes(o.type)) return "type not wanted";
  if (p.remoteOnly && o.location !== "remote") return "not remote";
  if (o.postedAt && -daysUntil(o.postedAt, now) > 30) return "stale (>30d)";
  if (o.deadline) {
    const d = daysUntil(o.deadline, now);
    if (d < 1 || d > p.deadlineWindowDays) return "deadline outside window";
  }
  // Known amounts must meet the minimum; unknown amounts pass (ranking handles them).
  const min = p.minPrizeUsd[o.type] ?? 0;
  if (o.amountUsd != null && o.amountUsd < min) return "below minimum pay";
  if (job && !isTechTitle(o.title)) return "not a tech title";
  // Roles must mention one of the target stacks
  if (job && !o.skills.some((s) => p.roleSkills.includes(s))) return "no target skill";
  if (job && overLevel(o.title, o.detail ?? o.snippet, p.experience)) return "too senior";
  if (p.regionFilter && job && residencyBlock(o.detail ?? o.snippet)) return "residency requirement"; // "must be based in the US" etc.
  return null;
}

export const keep = (o: RawOpp, cfg: Config, seen: Set<string>, now = new Date(), prefs?: Prefs): boolean =>
  rejectReason(o, cfg, seen, now, prefs) === null;
