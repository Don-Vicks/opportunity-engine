import { XMLParser } from "fast-xml-parser";
import type { Source, RawOpp } from "../schema.js";
import { getText } from "../http.js";
import { stripHtml, extractSkills, findApplyUrl, snippet, SKILL_VOCAB, detail } from "../helpers.js";

/** r/forhire "[Hiring]" posts via public Atom feed. Reddit may block datacenter IPs; failures are non-fatal. */
export const reddit: Source = {
  name: "Reddit",
  async fetch() {
    const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
    const xml = parser.parse(await getText("https://www.reddit.com/r/forhire/new.rss?limit=100"));
    const out: RawOpp[] = [];
    for (const e of [xml?.feed?.entry ?? []].flat()) {
      const title = stripHtml(String(e.title ?? ""));
      if (!/^\[?hiring\]?/i.test(title)) continue;
      const html = String(e.content?.["#text"] ?? e.content ?? "");
      const body = stripHtml(html.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      const url = String(e.link?.["@_href"] ?? "");
      out.push({
        id: `reddit:${e.id}`,
        title: title.replace(/^\[?hiring\]?\s*[-:]?\s*/i, ""),
        type: "freelance",
        source: "Reddit",
        url,
        applyUrl: findApplyUrl(html, ["reddit.com", "redd.it"], true),
        amountUsd: null,
        prizeLabel: "n/a",
        deadline: null,
        location: /onsite|on-site|in[- ]person/i.test(`${title} ${body}`) ? "onsite" : "remote",
        region: /\b(us|usa|uk|eu|europe)[ -]?only\b/i.test(`${title} ${body}`) ? "US only" : "",
        skills: extractSkills(title, SKILL_VOCAB, body, 2),
        snippet: snippet(body),
        detail: detail(body),
        effort: "medium",
        postedAt: e.updated ? new Date(e.updated) : null,
      });
    }
    return out;
  },
};
