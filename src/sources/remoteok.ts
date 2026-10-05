import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, normSkill, stripHtml, extractSkills, SKILL_VOCAB } from "../helpers.js";

interface Row {
  id?: string; position?: string; company?: string; tags?: string[]; description?: string;
  location?: string; url?: string; salary_min?: number; salary_max?: number; epoch?: number;
}

export const remoteok: Source = {
  name: "RemoteOK",
  async fetch() {
    const rows = (await getJson<Row[]>("https://remoteok.com/api")).filter((r) => r.position);
    return rows.map((r): RawOpp => {
      const max = r.salary_max || r.salary_min || 0;
      return {
        id: `remoteok:${r.id}`,
        title: `${r.position} @ ${r.company ?? "?"}`,
        type: "job",
        source: "RemoteOK",
        url: r.url ?? "https://remoteok.com",
        amountUsd: max > 0 ? max : null,
        prizeLabel: max > 0 ? `$${Math.round(max / 1000)}k/yr` : "n/a",
        deadline: null,
        location: "remote",
        region: r.location ?? "",
        skills: [...new Set([...(r.tags ?? []).map(normSkill), ...extractSkills(r.position ?? "", SKILL_VOCAB, stripHtml(r.description ?? ""))])],
        snippet: snippet(r.description ?? ""),
        effort: "high",
        postedAt: r.epoch ? new Date(r.epoch * 1000) : null,
      };
    });
  },
};
