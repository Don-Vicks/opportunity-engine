import type { Opportunity } from "../schema.js";
import { daysUntil } from "../helpers.js";
import { matchLabel } from "../ranking.js";

const TAG: Record<string, string> = {
  hackathon: "Hackathon", job: "Job", freelance: "Freelance", bounty: "Bounty", grant: "Grant", other: "Other",
};

function ago(d: Date, now: Date) {
  const days = Math.floor(-daysUntil(d, now));
  return days <= 0 ? "today" : `${days}d ago`;
}

export function formatDigest(items: Opportunity[], errors: string[], now = new Date()): string {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  if (!items.length) return `🎯 Daily Opportunities — ${date}\n\nNothing new cleared your filters today.` + footer(errors);
  const lines = [`🎯 Daily Opportunities — ${date}`, ""];
  items.forEach((o, i) => {
    const meta = [`${o.type === "job" ? "Rate" : "Prize"}: ${o.prizeLabel}`];
    if (o.deadline) meta.push(`Deadline: ${Math.max(0, Math.round(daysUntil(o.deadline, now)))} days`);
    else if (o.postedAt) meta.push(`Posted: ${ago(o.postedAt, now)}`);
    meta.push(`Match: ${matchLabel(o.score)}`);
    lines.push(`${i + 1}. [${TAG[o.type]}] ${o.title}`, `   ${meta.join(" | ")}`, `   → ${o.url}`, "");
  });
  lines.push("— End of digest —");
  return lines.join("\n") + footer(errors);
}

const footer = (errors: string[]) => (errors.length ? `\n\n⚠️ Sources failed: ${errors.join(", ")}` : "");
