import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, stripHtml, extractSkills, findApplyUrl, SKILL_VOCAB, detail } from "../helpers.js";

interface Job {
  title: string; companyName: string; employmentType?: string; minSalary?: number | null; maxSalary?: number | null;
  salaryPeriod?: string; currency?: string; locationRestrictions?: string[]; description?: string; excerpt?: string;
  pubDate?: number | string; expiryDate?: number | string; applicationLink: string; guid?: string;
}

const QUERIES = ["nextjs", "react", "expo", "react native", "express", "nestjs", "rust"];

export const himalayas: Source = {
  name: "Himalayas",
  async fetch() {
    const out = new Map<string, RawOpp>();
    const now = Date.now() / 1000;
    for (const q of QUERIES) {
      const res = await getJson<{ jobs: Job[] }>(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent`);
      for (const j of res.jobs ?? []) {
        if (j.expiryDate && Number(j.expiryDate) < now) continue;
        const usd = j.currency === "USD" && j.salaryPeriod === "annual" ? (j.maxSalary ?? j.minSalary ?? null) : null;
        const contract = /contract|freelance/i.test(j.employmentType ?? "");
        const body = stripHtml(j.description ?? j.excerpt ?? "");
        out.set(j.guid ?? j.applicationLink, {
          id: `himalayas:${j.guid ?? j.applicationLink}`,
          title: `${stripHtml(j.title)} @ ${j.companyName}`,
          type: contract ? "freelance" : "job",
          source: "Himalayas",
          url: j.applicationLink,
          applyUrl: findApplyUrl(j.description ?? "", ["himalayas.app"]),
          amountUsd: usd || null,
          prizeLabel: usd ? `$${Math.round(usd / 1000)}k/yr` : "n/a",
          deadline: null,
          location: "remote",
          region: (j.locationRestrictions ?? []).join(", "),
          skills: extractSkills(j.title, SKILL_VOCAB, body),
          snippet: snippet(body),
          detail: detail(body),
          effort: contract ? "medium" : "high",
          postedAt: j.pubDate ? new Date(Number(j.pubDate) * 1000) : null,
        });
      }
    }
    return [...out.values()];
  },
};
