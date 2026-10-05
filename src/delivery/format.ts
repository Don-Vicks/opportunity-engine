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
  const lines = [`🎯 New Opportunities — ${date}`, ""];
  for (const t of ["job", "freelance", "bounty", "hackathon", "grant", "other"]) {
    const list = items.filter((o) => o.type === t);
    if (!list.length) continue;
    lines.push(`== ${TAG[t].toUpperCase()} (${list.length}) ==`, "");
    list.forEach((o, i) => {
      const meta = [`${o.type === "job" ? "Rate" : "Prize"}: ${o.prizeLabel}`];
      if (o.deadline) meta.push(`Deadline: ${Math.max(0, Math.round(daysUntil(o.deadline, now)))} days`);
      else if (o.postedAt) meta.push(`Posted: ${ago(o.postedAt, now)}`);
      meta.push(`Match: ${matchLabel(o.score)}`);
      lines.push(`${i + 1}. ${o.title}`, `   ${meta.join(" | ")}`, `   → ${o.applyUrl ?? o.url}${o.applyUrl ? "  (direct apply)" : ""}`, "");
    });
  }
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
  const head = `🎯 <b>New Opportunities</b>\n<i>${esc(date)}</i>`;
  const warn = errors.length ? `\n\n⚠️ <i>Sources failed: ${esc(errors.join(", "))}</i>` : "";
  if (!items.length) return `${head}\n\nNothing new cleared your filters today. 🌙${warn}`;

  const SECTION: Record<string, string> = {
    job: "💼 JOBS", freelance: "🛠 FREELANCE & CONTRACTS", bounty: "💰 BOUNTIES", hackathon: "🏆 HACKATHONS", grant: "🎁 GRANTS", other: "📌 OTHER",
  };
  const order = Object.keys(SECTION);
  const groups = order
    .map((t) => ({ t, list: items.filter((o) => o.type === t) }))
    .filter((g) => g.list.length);

  const blocks: string[] = [];
  for (const g of groups) {
    g.list.forEach((o, i) => {
      const m = matchLabel(o.score);
      const parts = [o.prizeLabel !== "n/a" ? `${o.type === "job" ? "💵" : "💰"} <b>${esc(o.prizeLabel)}</b>` : null];
      if (o.deadline) parts.push(deadlineLabel(o.deadline, now));
      else if (o.postedAt) parts.push(`🕒 ${ago(o.postedAt, now)}`);
      parts.push(`${MATCH_ICON[m]} ${m}`);
      const card = [
        `${NUM[i] ?? `${i + 1}.`} <b>${esc(o.title)}</b>`,
        `<i>${esc(o.source)}</i>`,
        parts.filter(Boolean).join("  ·  "),
        linkLine(o),
      ].join("\n");
      // header rides with the first card so a message split never strands it
      blocks.push(i === 0 ? `<b>${SECTION[g.t]}  ·  ${g.list.length}</b>\n━━━━━━━━━━━━━━\n${card}` : card);
    });
  }
  const summary = groups.map((g) => `${g.list.length} ${g.t === "freelance" ? "freelance" : g.t + (g.list.length > 1 ? "s" : "")}`).join(" · ");
  return `${head}\n\n${blocks.join("\n\n")}\n\n<i>— ${summary} —</i>${warn}`;
}

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };

/** Direct apply link first (with its domain), listing/source link second so attribution stays intact. */
function linkLine(o: Opportunity): string {
  if (o.applyUrl) {
    return `🚀 <a href="${esc(o.applyUrl)}">Apply directly</a> <i>(${esc(hostOf(o.applyUrl))})</i>  ·  <a href="${esc(o.url)}">via ${esc(o.source)}</a>`;
  }
  return `🔗 <a href="${esc(o.url)}">Open listing</a>`;
}
