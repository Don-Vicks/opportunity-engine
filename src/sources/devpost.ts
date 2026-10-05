import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { extractSkills, SKILL_VOCAB } from "../helpers.js";

interface Hack {
  id: number; title: string; url: string; displayed_location?: { location?: string };
  submission_period_dates?: string; prize_amount?: string; themes?: { name: string }[];
  organization_name?: string;
}

/** "Aug 21 - Oct 05, 2026" | "Oct 01 - 10, 2026" | "Dec 20, 2026 - Jan 15, 2027" -> end Date */
export function parseDevpostEnd(s?: string): Date | null {
  if (!s) return null;
  const [start, endRaw] = s.split(/\s+-\s+/).map((x) => x.trim());
  if (!endRaw) return null;
  let end = endRaw;
  if (/^\d{1,2},/.test(end)) end = `${start.split(" ")[0]} ${end}`; // month omitted
  const d = new Date(`${end} 23:59:59 UTC`);
  return isNaN(d.getTime()) ? null : d;
}

export function parsePrize(html?: string): number | null {
  const m = html?.match(/>\s*([\d,]+)\s*</);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return n > 0 ? n : null;
}

export const devpost: Source = {
  name: "Devpost",
  async fetch() {
    const out: RawOpp[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await getJson<{ hackathons: Hack[] }>(
        `https://devpost.com/api/hackathons?status[]=open&order_by=prize-amount&page=${page}`,
      );
      if (!res.hackathons?.length) break;
      for (const h of res.hackathons) {
        const prize = parsePrize(h.prize_amount);
        const loc = h.displayed_location?.location ?? "Online";
        const themes = (h.themes ?? []).map((t) => t.name);
        out.push({
          id: `devpost:${h.id}`,
          title: h.title.trim(),
          type: "hackathon",
          source: "Devpost",
          url: h.url,
          amountUsd: prize,
          prizeLabel: prize ? `$${prize.toLocaleString("en-US")}` : "n/a",
          deadline: parseDevpostEnd(h.submission_period_dates),
          location: /online/i.test(loc) ? "remote" : loc,
          skills: extractSkills(`${h.title} ${themes.join(" ")}`, SKILL_VOCAB),
          snippet: `${h.organization_name ?? ""} · ${themes.join(", ")}`.replace(/^ · /, ""),
          effort: "medium",
          postedAt: null,
        });
      }
    }
    return out;
  },
};
