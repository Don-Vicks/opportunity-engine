import type { Opportunity } from "./schema.js";
import { esc } from "./delivery/format.js";
import { readHistory, readHealth, upcoming, readState } from "./store.js";

const WAT = 3_600_000; // UTC+1
const wat = (d: Date) => new Date(d.getTime() + WAT);

/** Monday key (YYYY-MM-DD, WAT) if it's Monday >= 08:00 WAT and this week's summary hasn't gone out. */
export function weeklyDue(now = new Date(), last = readState().lastWeekly): string | null {
  const w = wat(now);
  if (w.getUTCDay() !== 1 || w.getUTCHours() < 8) return null;
  const key = w.toISOString().slice(0, 10);
  return last === key ? null : key;
}

const TYPE_ICON: Record<string, string> = { job: "💼", freelance: "🛠", bounty: "💰", hackathon: "🏆", grant: "🎁", other: "📌" };

export function buildWeekly(now = new Date()): string {
  const hist = readHistory(7, now);
  const byType = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const o of hist) {
    byType.set(o.type, (byType.get(o.type) ?? 0) + 1);
    bySource.set(o.source, (bySource.get(o.source) ?? 0) + 1);
  }
  const top = [...hist].sort((a, b) => b.score - a.score).slice(0, 5);
  const soon = upcoming(now, 7).slice(0, 6);
  const sick = Object.entries(readHealth()).filter(([, h]) => h.alerted).map(([n]) => n);

  const lines = [`📊 <b>Weekly Summary</b>\n<i>${esc(wat(now).toISOString().slice(0, 10))}</i>`, ""];
  lines.push(`<b>${hist.length}</b> opportunities sent this week`);
  if (byType.size) lines.push([...byType].map(([t, n]) => `${TYPE_ICON[t] ?? "📌"} ${n} ${t}`).join("  ·  "));
  if (bySource.size) {
    lines.push("", "<b>Best sources</b>", [...bySource].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${esc(s)} (${n})`).join(", "));
  }
  if (top.length) {
    lines.push("", "<b>Top picks</b>", ...top.map((o: Opportunity) => `• <a href="${esc(o.applyUrl ?? o.url)}">${esc(o.title.slice(0, 80))}</a> — ${o.prizeLabel !== "n/a" ? esc(o.prizeLabel) : esc(o.source)}`));
  }
  if (soon.length) {
    lines.push("", "<b>Closing in the next 7 days</b>", ...soon.map((r) => {
      const d = Math.max(0, Math.ceil((r.deadline.getTime() - now.getTime()) / 86_400_000));
      return `• ${d}d — <a href="${esc(r.lite.applyUrl ?? r.lite.url)}">${esc(r.lite.title.slice(0, 70))}</a>`;
    }));
  }
  if (sick.length) lines.push("", `⚠️ Sources currently failing: ${esc(sick.join(", "))}`);
  lines.push("", "<i>Tune me: /mute &lt;word&gt; · /boost &lt;word&gt; · /prefs</i>");
  return lines.join("\n");
}
