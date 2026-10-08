import type { Config } from "./config.js";
import type { RawOpp } from "./schema.js";
import { hasWord } from "./prefs.js";
import type { Prefs } from "./store.js";
import { overLevel } from "./seniority.js";
import { daysUntil, regionOk, looksClosed, isTechTitle } from "./helpers.js";

export function keep(o: RawOpp, cfg: Config, seen: Set<string>, now = new Date(), prefs?: Prefs): boolean {
  const p = cfg.profile;
  if (seen.has(o.id)) return false;
  const title = o.title.toLowerCase();
  if (prefs?.mute.length && hasWord(title, prefs.mute)) return false;
  if (p.excludeKeywords.some((k) => title.includes(k.toLowerCase()))) return false;
  if (p.regionFilter && !regionOk(o.region)) return false;
  if (looksClosed(`${o.title} ${o.snippet}`)) return false; // already filled / client chosen
  if (!p.preferredTypes.includes(o.type)) return false;
  if (p.remoteOnly && o.location !== "remote") return false;
  if (o.postedAt && -daysUntil(o.postedAt, now) > 30) return false; // stale posting
  if (o.deadline) {
    const d = daysUntil(o.deadline, now);
    if (d < 1 || d > p.deadlineWindowDays) return false;
  }
  // Known amounts must meet the minimum; unknown amounts pass (ranking handles them).
  const min = p.minPrizeUsd[o.type] ?? 0;
  if (o.amountUsd != null && o.amountUsd < min) return false;
  if ((o.type === "job" || o.type === "freelance") && !isTechTitle(o.title)) return false;
  // Roles must mention one of the target stacks
  if ((o.type === "job" || o.type === "freelance") && !o.skills.some((s) => p.roleSkills.includes(s))) return false;
  if ((o.type === "job" || o.type === "freelance") && overLevel(o.title, o.snippet, p.experience)) return false;
  return true;
}
