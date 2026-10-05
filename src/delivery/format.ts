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

// ---------- Telegram (HTML) ----------
const ICON: Record<string, string> = {
  hackathon: "🏆", job: "💼", freelance: "🛠", bounty: "💰", grant: "🎁", other: "📌",
};
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const MATCH_ICON: Record<string, string> = { "Very High": "🔥", High: "✅", Medium: "🟡", Low: "⚪" };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function deadlineLabel(d: Date, now: Date): string {
  const days = Math.max(0, Math.ceil(daysUntil(d, now)));
  return days <= 2 ? `⚠️ ${days}d left` : `⏳ ${days}d left`;
}

export function formatTelegram(items: Opportunity[], errors: string[], now = new Date()): string {
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  const head = `🎯 <b>Daily Opportunities</b>\n<i>${esc(date)}</i>`;
  const warn = errors.length ? `\n\n⚠️ <i>Sources failed: ${esc(errors.join(", "))}</i>` : "";
  if (!items.length) return `${head}\n\nNothing new cleared your filters today. 🌙${warn}`;

  const blocks = items.map((o, i) => {
    const m = matchLabel(o.score);
    const parts = [o.prizeLabel !== "n/a" ? `${o.type === "job" ? "💵" : "💰"} <b>${esc(o.prizeLabel)}</b>` : null];
    if (o.deadline) parts.push(deadlineLabel(o.deadline, now));
    else if (o.postedAt) parts.push(`🕒 ${ago(o.postedAt, now)}`);
    parts.push(`${MATCH_ICON[m]} ${m}`);
    return [
      `${NUM[i] ?? `${i + 1}.`} ${ICON[o.type]} <b>${esc(o.title)}</b>`,
      `<i>${esc(TAG[o.type])} · ${esc(o.source)}</i>`,
      parts.filter(Boolean).join("  ·  "),
      `🔗 <a href="${esc(o.url)}">Open listing</a>`,
    ].join("\n");
  });
  return `${head}\n\n${blocks.join("\n\n")}\n\n<i>— ${items.length} picks · end of digest —</i>${warn}`;
}
