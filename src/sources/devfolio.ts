import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { extractSkills, SKILL_VOCAB } from "../helpers.js";

interface Hack {
  name: string; slug: string; tagline?: string; is_online?: boolean; starts_at?: string; ends_at?: string;
  hackathon_setting?: { reg_ends_at?: string | null; external_apply_url?: string | null };
  themes?: { name: string }[]; type?: string;
}

/** Online hackathons with applications open. In-person events are skipped (remoteOnly). */
export const devfolio: Source = {
  name: "Devfolio",
  async fetch() {
    const out: RawOpp[] = [];
    for (let page = 1; page <= 2; page++) {
      const res = await getJson<{ result: Hack[] }>(
        `https://api.devfolio.co/api/hackathons?filter=application_open&page=${page}&limit=20`,
      );
      if (!res.result?.length) break;
      for (const h of res.result) {
        if (!h.is_online) continue;
        const themes = (h.themes ?? []).map((t) => t.name).filter((t) => !/^no restriction/i.test(t));
        const close = h.hackathon_setting?.reg_ends_at ?? h.ends_at;
        out.push({
          id: `devfolio:${h.slug}`,
          title: h.name.trim(),
          type: "hackathon",
          source: "Devfolio",
          url: `https://${h.slug}.devfolio.co`,
          applyUrl: h.hackathon_setting?.external_apply_url || undefined,
          amountUsd: null,
          prizeLabel: "n/a",
          deadline: close ? new Date(close) : null,
          location: "remote",
          skills: extractSkills(`${h.name} ${h.tagline ?? ""} ${themes.join(" ")}`, SKILL_VOCAB, "", 1),
          snippet: [h.tagline, themes.join(", ")].filter(Boolean).join(" · "),
          effort: "medium",
          postedAt: null,
        });
      }
    }
    return out;
  },
};
