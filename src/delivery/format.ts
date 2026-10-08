import type { Opportunity } from "../schema.js";
import { daysUntil, nigeriaFriendly } from "../helpers.js";
import { matchLabel } from "../ranking.js";
import type { Reminder } from "../store.js";

const FIT_TEXT = { qualified: "Qualified", stretch: "Stretch", not_a_fit: "Not a fit" };
const FIT_ICON = { qualified: "🟢", stretch: "🟠", not_a_fit: "🔴" };
const isNg = (o: Opportunity) => nigeriaFriendly(o.region, o.title, o.snippet);
const TAG: Record<string, string> = {
  hackathon: "Hackathon", job: "Job", freelance: "Freelance", bounty: "Bounty", grant: "Grant", other: "Other",
};

function ago(d: Date, now: Date) {
  const days = Math.floor(-daysUntil(d, now));
  return days <= 0 ? "today" : `${days}d ago`;
}

export function formatDigest(items: Opportunity[], errors: string[], now = new Date(), reminders: Reminder[] = []): string {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  if (!items.length && !reminders.length) return `🎯 Daily Opportunities — ${date}\n\nNothing new cleared your filters today.` + footer(errors);
  const lines = [`🎯 New Opportunities — ${date}`, ""];
  if (reminders.length) {
    lines.push(`== LAST CALL (${reminders.length}) ==`, "");
    for (const r of reminders) lines.push(`• ${r.lite.title} — closes in ${hoursLeft(r.deadline, now)}h`, `  → ${r.lite.applyUrl ?? r.lite.url}`, "");
  }
  let num = 0;
  for (const t of ["job", "freelance", "bounty", "hackathon", "grant", "other"]) {
    const list = items.filter((o) => o.type === t);
    if (!list.length) continue;
    lines.push(`== ${TAG[t].toUpperCase()} (${list.length}) ==`, "");
    list.forEach((o) => {
      const meta = [`${o.type === "job" ? "Rate" : "Prize"}: ${o.prizeLabel}`];
      if (o.deadline) meta.push(`Deadline: ${Math.max(0, Math.round(daysUntil(o.deadline, now)))} days`);
      else if (o.postedAt) meta.push(`Posted: ${ago(o.postedAt, now)}`);
      meta.push(`Match: ${matchLabel(o.score)}`);
      if (o.fit) meta.push(`Fit: ${FIT_TEXT[o.fit.verdict]}`);
      lines.push(`${++num}. ${isNg(o) ? "[NG] " : ""}${o.title}`, `   ${meta.join(" | ")}`, ...(o.fit?.reason ? [`   ${o.fit.reason}`] : []), `   → ${o.applyUrl ?? o.url}${o.applyUrl ? "  (direct apply)" : ""}`, "");
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

export function formatTelegram(items: Opportunity[], errors: string[], now = new Date(), reminders: Reminder[] = []): string {
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  const head = `🎯 <b>New Opportunities</b>\n<i>${esc(date)}</i>`;
  const warn = errors.length ? `\n\n⚠️ <i>Sources failed: ${esc(errors.join(", "))}</i>` : "";
  if (!items.length && !reminders.length) return `${head}\n\nNothing new cleared your filters today. 🌙${warn}`;

  const SECTION: Record<string, string> = {
    job: "💼 JOBS", freelance: "🛠 FREELANCE & CONTRACTS", bounty: "💰 BOUNTIES", hackathon: "🏆 HACKATHONS", grant: "🎁 GRANTS", other: "📌 OTHER",
  };
  const order = Object.keys(SECTION);
  const groups = order
    .map((t) => ({ t, list: items.filter((o) => o.type === t) }))
    .filter((g) => g.list.length);

  const blocks: string[] = [];
  let n = 0; // numbering runs across sections so "/pitch 3" is unambiguous
  for (const g of groups) {
    g.list.forEach((o, i) => {
      const m = matchLabel(o.score);
      const parts = [o.prizeLabel !== "n/a" ? `${o.type === "job" ? "💵" : "💰"} <b>${esc(o.prizeLabel)}</b>` : null];
      if (o.deadline) parts.push(deadlineLabel(o.deadline, now));
      else if (o.postedAt) parts.push(`🕒 ${ago(o.postedAt, now)}`);
      parts.push(`${MATCH_ICON[m]} ${m}`);
      const card = [
        `${NUM[n++] ?? `${n}.`} ${isNg(o) ? "🇳🇬 " : ""}<b>${esc(o.title)}</b>`,
        `<i>${esc(o.source)}</i>`,
        parts.filter(Boolean).join("  ·  "),
        ...(o.fit ? [`${FIT_ICON[o.fit.verdict]} <b>${FIT_TEXT[o.fit.verdict]}</b>${o.fit.reason ? ` — ${esc(o.fit.reason)}` : ""}`] : []),
        linkLine(o),
      ].join("\n");
      // header rides with the first card so a message split never strands it
      blocks.push(i === 0 ? `<b>${SECTION[g.t]}  ·  ${g.list.length}</b>\n━━━━━━━━━━━━━━\n${card}` : card);
    });
  }
  if (reminders.length) blocks.unshift(...reminderBlocks(reminders, now));
  const summary = groups.map((g) => `${g.list.length} ${g.t === "freelance" ? "freelance" : g.t + (g.list.length > 1 ? "s" : "")}`).join(" · ");
  return `${head}\n\n${blocks.join("\n\n")}\n\n<i>— ${summary || "reminders only"} —</i>${warn}`;
}

const GCAL_DATE = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, ""); // 20261018T225900Z

/**
 * One-tap "add to Google Calendar" link: a 30-minute block that ends at the deadline, so it shows up
 * right where the cutoff is. Plain URL, no login or API needed; the user taps Save in Calendar.
 */
export function calendarUrl(title: string, deadline: Date, url: string): string {
  const start = new Date(deadline.getTime() - 30 * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `⏰ Deadline: ${title}`.slice(0, 120),
    dates: `${GCAL_DATE(start)}/${GCAL_DATE(deadline)}`,
    details: `Apply: ${url}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };

/** Direct apply link first (with its domain), listing/source link second so attribution stays intact. */
function linkLine(o: Opportunity): string {
  const cal = o.deadline ? `\n📅 <a href="${esc(calendarUrl(o.title, o.deadline, o.applyUrl ?? o.url))}">Add deadline to calendar</a>` : "";
  if (o.applyUrl) {
    return `🚀 <a href="${esc(o.applyUrl)}">Apply directly</a> <i>(${esc(hostOf(o.applyUrl))})</i>  ·  <a href="${esc(o.url)}">via ${esc(o.source)}</a>${cal}`;
  }
  return `🔗 <a href="${esc(o.url)}">Open listing</a>${cal}`;
}

const hoursLeft = (d: Date, now: Date) => Math.max(1, Math.round((d.getTime() - now.getTime()) / 3_600_000));

/** "Last call" cards for already-sent items whose deadline is close. First card carries the header. */
function reminderBlocks(rs: Reminder[], now: Date): string[] {
  return rs.map((r, i) => {
    const h = hoursLeft(r.deadline, now);
    const left = h >= 24 ? `${Math.round(h / 24)}d ${h % 24 ? `${h % 24}h ` : ""}left`.replace("1d 0h", "1d") : `${h}h left`;
    const link = r.lite.applyUrl
      ? `🚀 <a href="${esc(r.lite.applyUrl)}">Apply directly</a> <i>(${esc(hostOf(r.lite.applyUrl))})</i>`
      : `🔗 <a href="${esc(r.lite.url)}">Open listing</a>`;
    const card = [
      `${ICON[r.lite.type]} <b>${esc(r.lite.title)}</b>`,
      `<i>${esc(TAG[r.lite.type])} · ${esc(r.lite.source)}</i>`,
      `⚠️ <b>Closes in ${left}</b>${r.lite.prizeLabel !== "n/a" ? `  ·  💰 ${esc(r.lite.prizeLabel)}` : ""}`,
      link,
    ].join("\n");
    return i === 0 ? `<b>⏰ LAST CALL  ·  ${rs.length}</b>\n<i>Sent earlier, closing soon</i>\n━━━━━━━━━━━━━━\n${card}` : card;
  });
}
