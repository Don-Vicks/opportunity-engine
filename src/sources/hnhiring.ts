import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { stripHtml, extractSkills, restrictiveRegion, findApplyUrl, SKILL_VOCAB } from "../helpers.js";

interface Hit { objectID: string; comment_text?: string; parent_id?: number; created_at?: string; story_id?: number }

/** Monthly "Ask HN: Who is hiring?" thread: first line of each top-level comment is "Company | Role | Location | REMOTE". */
export const hnhiring: Source = {
  name: "HN Who's Hiring",
  async fetch() {
    const stories = await getJson<{ hits: { objectID: string; title: string }[] }>(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6",
    );
    const story = stories.hits.find((h) => /who is hiring/i.test(h.title));
    if (!story) return [];
    const res = await getJson<{ hits: Hit[] }>(
      `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=1000`,
    );
    const out: RawOpp[] = [];
    for (const c of res.hits) {
      if (String(c.parent_id) !== story.objectID || !c.comment_text) continue; // top-level only
      const [headRaw] = c.comment_text.split(/<p>/i);
      const head = stripHtml(headRaw);
      const body = stripHtml(c.comment_text);
      const remote = /remote/i.test(head);
      out.push({
        id: `hn:${c.objectID}`,
        title: head.length > 120 ? head.slice(0, 119) + "…" : head,
        type: /contract|freelance/i.test(head) ? "freelance" : "job",
        source: "HN Who's Hiring",
        url: `https://news.ycombinator.com/item?id=${c.objectID}`,
        applyUrl: findApplyUrl(c.comment_text, ["ycombinator.com"], true),
        amountUsd: null,
        prizeLabel: "n/a",
        deadline: null,
        location: remote ? "remote" : "onsite",
        region: restrictiveRegion(head),
        skills: extractSkills(head, SKILL_VOCAB, body),
        snippet: body.slice(head.length, head.length + 160).trim(),
        effort: "high",
        postedAt: c.created_at ? new Date(c.created_at) : null,
      });
    }
    return out;
  },
};
