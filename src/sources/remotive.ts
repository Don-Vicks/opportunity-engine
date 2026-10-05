import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, normSkill, stripHtml, extractSkills, findApplyUrl, parseSalaryUsd, SKILL_VOCAB } from "../helpers.js";

interface Job {
  id: number; url: string; title: string; company_name: string; tags?: string[]; job_type?: string;
  publication_date?: string; candidate_required_location?: string; salary?: string; description?: string;
}

export const remotive: Source = {
  name: "Remotive",
  async fetch() {
    const res = await getJson<{ jobs: Job[] }>("https://remotive.com/api/remote-jobs?category=software-dev&limit=200");
    return res.jobs.map((j): RawOpp => {
      const freelance = /freelance|contract/i.test(j.job_type ?? "");
      const usd = parseSalaryUsd(j.salary);
      return {
        id: `remotive:${j.id}`,
        title: `${stripHtml(j.title)} @ ${j.company_name.trim()}`,
        type: freelance ? "freelance" : "job",
        source: "Remotive",
        url: j.url,
        applyUrl: findApplyUrl(j.description ?? "", ["remotive.com", "remotive.io"]),
        amountUsd: usd,
        prizeLabel: j.salary?.trim() || "n/a",
        deadline: null,
        location: "remote",
        region: j.candidate_required_location ?? "",
        skills: [...new Set([...(j.tags ?? []).map(normSkill), ...extractSkills(j.title, SKILL_VOCAB, stripHtml(j.description ?? ""))])],
        snippet: snippet(j.description ?? ""),
        effort: freelance ? "medium" : "high",
        postedAt: j.publication_date ? new Date(j.publication_date + "Z") : null,
      };
    });
  },
};
