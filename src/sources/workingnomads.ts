import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { snippet, normSkill, stripHtml, extractSkills, findApplyUrl, SKILL_VOCAB } from "../helpers.js";

interface Job {
  url: string; title: string; description?: string; company_name?: string; category_name?: string;
  tags?: string; location?: string; pub_date?: string;
}

export const workingnomads: Source = {
  name: "Working Nomads",
  async fetch() {
    const rows = await getJson<Job[]>("https://www.workingnomads.com/api/exposed_jobs/");
    return rows
      .filter((j) => /development|devops|software/i.test(j.category_name ?? ""))
      .map((j): RawOpp => ({
        id: `wn:${j.url}`,
        title: `${stripHtml(j.title)}${j.company_name ? ` @ ${j.company_name}` : ""}`,
        type: /contract|freelance/i.test(j.title) ? "freelance" : "job",
        source: "Working Nomads",
        url: j.url,
        applyUrl: findApplyUrl(j.description ?? "", ["workingnomads.com"]),
        amountUsd: null,
        prizeLabel: "n/a",
        deadline: null,
        location: "remote",
        region: j.location ?? "",
        skills: [...new Set([
          ...(j.tags ?? "").split(",").map(normSkill).filter(Boolean),
          ...extractSkills(j.title, SKILL_VOCAB, stripHtml(j.description ?? "")),
        ])],
        snippet: snippet(j.description ?? ""),
        effort: "high",
        postedAt: j.pub_date ? new Date(j.pub_date) : null,
      }));
  },
};
