import { XMLParser } from "fast-xml-parser";
import type { Source, RawOpp } from "../schema.js";
import { getText } from "../http.js";
import { snippet, stripHtml, extractSkills, SKILL_VOCAB } from "../helpers.js";

const FEEDS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
];

export const weworkremotely: Source = {
  name: "WeWorkRemotely",
  async fetch() {
    const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
    const out: RawOpp[] = [];
    for (const feed of FEEDS) {
      const xml = parser.parse(await getText(feed));
      const items = [xml?.rss?.channel?.item ?? []].flat();
      for (const it of items) {
        const contract = /contract|freelance/i.test(String(it.title)) || it.type === "Contract";
        out.push({
          id: `wwr:${it.guid?.["#text"] ?? it.guid ?? it.link}`,
          title: stripHtml(String(it.title)),
          type: contract ? "freelance" : "job",
          source: "WeWorkRemotely",
          url: String(it.link),
          amountUsd: null,
          prizeLabel: "n/a",
          deadline: null,
          location: "remote",
          skills: extractSkills(String(it.title), SKILL_VOCAB, stripHtml(String(it.description ?? ""))),
          snippet: snippet(String(it.description ?? "")),
          effort: contract ? "medium" : "high",
          postedAt: it.pubDate ? new Date(it.pubDate) : null,
        });
      }
    }
    return out;
  },
};
