import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, stripHtml, extractSkills, findApplyUrl, SKILL_VOCAB } from "../helpers.js";

interface Job {
  id: number; url: string; jobTitle: string; companyName: string; jobType?: string[]; jobGeo?: string;
  jobExcerpt?: string; pubDate?: string; salaryMin?: number; salaryMax?: number; salaryCurrency?: string; salaryPeriod?: string;
}

const TAGS = ["nextjs", "react", "rust", "nodejs", "nestjs", "react-native"];

export const jobicy: Source = {
  name: "Jobicy",
  async fetch() {
    const out = new Map<number, RawOpp>();
    for (const tag of TAGS) {
      const res = await getJson<{ jobs?: Job[] }>(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${tag}`);
      for (const j of res.jobs ?? []) {
        const usd = j.salaryCurrency === "USD" && j.salaryPeriod === "yearly" ? (j.salaryMax ?? j.salaryMin ?? null) : null;
        const contract = (j.jobType ?? []).some((t) => /contract|freelance/i.test(t));
        const text = stripHtml(j.jobExcerpt ?? "");
        out.set(j.id, {
          id: `jobicy:${j.id}`,
          title: `${stripHtml(j.jobTitle)} @ ${j.companyName}`,
          type: contract ? "freelance" : "job",
          source: "Jobicy",
          url: j.url,
          applyUrl: findApplyUrl(j.jobExcerpt ?? "", ["jobicy.com"]),
          amountUsd: usd || null,
          prizeLabel: usd ? `$${Math.round(usd / 1000)}k/yr` : "n/a",
          deadline: null,
          location: "remote",
          region: j.jobGeo ?? "",
          // the tag we searched by is a strong signal, plus anything in title/excerpt
          skills: [...new Set([...extractSkills(j.jobTitle, SKILL_VOCAB, text, 1), tag === "nodejs" ? "node" : tag === "react-native" ? "expo" : tag])],
          snippet: snippet(text),
          effort: contract ? "medium" : "high",
          postedAt: j.pubDate ? new Date(j.pubDate) : null,
        });
      }
    }
    return [...out.values()];
  },
};
