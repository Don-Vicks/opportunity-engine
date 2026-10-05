import type { Config } from "./config.js";
import type { RawOpp } from "./schema.js";
import { daysUntil } from "./helpers.js";

export function keep(o: RawOpp, cfg: Config, seen: Set<string>, now = new Date()): boolean {
  const p = cfg.profile;
  if (seen.has(o.id)) return false;
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
  // Jobs with no skill overlap are noise
  if (o.type === "job" && !o.skills.some((s) => p.skills.includes(s))) return false;
  return true;
}
