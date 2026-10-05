import type { Config } from "./config.js";
import type { Effort, Opportunity, RawOpp } from "./schema.js";
import { daysUntil, normSkill } from "./helpers.js";

type Profile = Config["profile"];
const EFFORT: Record<Effort, number> = { low: 1, medium: 2, high: 3 };

export function skillScore(o: RawOpp, p: Profile): number {
  const mine = new Set(p.skills.map(normSkill));
  const theirs = [...new Set(o.skills.map(normSkill))];
  if (!theirs.length) return 0.2;
  const hit = theirs.filter((s) => mine.has(s)).length;
  // fraction of the listing's skills I cover, floored so a single hit still counts
  return Math.min(1, Math.max(hit / theirs.length, hit > 0 ? 0.5 : 0));
}

export function compScore(o: RawOpp, p: Profile): number {
  if (o.amountUsd == null) return 0.3; // unknown: neutral, not punished
  const min = p.minPrizeUsd[o.type] ?? 0;
  if (min <= 0) return 0.5;
  return Math.min(1, o.amountUsd / (3 * min));
}

export function urgencyScore(o: RawOpp, now = new Date()): number {
  if (!o.deadline) return 0.3;
  const d = daysUntil(o.deadline, now);
  if (d < 1) return 0;
  if (d < 3) return 0.5 + (d - 1) * 0.25; // 0.5..1
  if (d <= 14) return 1;
  return Math.max(0.1, 1 - (d - 14) / 30);
}

export function effortScore(o: RawOpp, p: Profile): number {
  if (!o.effort) return 0.5;
  const gap = EFFORT[o.effort] - EFFORT[p.availableEffort];
  return gap <= 0 ? 1 : gap === 1 ? 0.5 : 0.1;
}

export function score(o: RawOpp, p: Profile, now = new Date()): number {
  return +(
    skillScore(o, p) * 0.4 + compScore(o, p) * 0.3 + urgencyScore(o, now) * 0.2 + effortScore(o, p) * 0.1
  ).toFixed(3);
}

export const matchLabel = (s: number) =>
  s >= 0.75 ? "Very High" : s >= 0.6 ? "High" : s >= 0.45 ? "Medium" : "Low";

export function rank(raw: RawOpp[], p: Profile, now = new Date()): Opportunity[] {
  return raw
    .map((o) => ({ ...o, score: score(o, p, now), foundAt: now }))
    .sort((a, b) => b.score - a.score);
}
