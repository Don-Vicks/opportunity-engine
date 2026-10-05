import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, normSkill } from "../helpers.js";

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
        skills: (r.tags ?? []).map(normSkill),
        snippet: snippet(r.description ?? ""),
        effort: "high",
        postedAt: r.epoch ? new Date(r.epoch * 1000) : null,
      };
    });
  },
};
