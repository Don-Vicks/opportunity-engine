import { XMLParser } from "fast-xml-parser";
import type { Source, RawOpp } from "../schema.js";
import { getText } from "../http.js";
import { stripHtml, extractSkills, findApplyUrl, snippet, SKILL_VOCAB, detail } from "../helpers.js";

// Public hashtag RSS (no auth). X/Twitter has no free read access, so Mastodon is the open stand-in.
const TAGS = ["hiring", "jobopening", "rustjobs", "reactjobs", "remotejobs", "web3jobs"];
const SEEKER = /(available for hire|looking for (work|a job|a new role)|open to (work|opportunities)|seeking (a )?(job|role|work)|i am (available|looking)|i'?m (available|looking))/i;
const HIRING = /(we'?re hiring|we are hiring|hiring[:!]|now hiring|open (role|position)|join (us|our team)|looking for (a |an )?(senior|junior|rust|react|full|front|back|dev|engineer))/i;

export const mastodon: Source = {
  name: "Mastodon",
  async fetch() {
    const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
    const out = new Map<string, RawOpp>();
    for (const tag of TAGS) {
      const xml = parser.parse(await getText(`https://mastodon.social/tags/${tag}.rss`).catch(() => ""));
      for (const it of [xml?.rss?.channel?.item ?? []].flat()) {
        const html = String(it.description ?? "");
        const text = stripHtml(html.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
        if (SEEKER.test(text) || !HIRING.test(text)) continue;
        const id = String(it.guid?.["#text"] ?? it.guid ?? it.link);
        out.set(id, {
          id: `mastodon:${id}`,
          title: text.length > 110 ? text.slice(0, 109) + "…" : text,
          type: /contract|freelance|gig/i.test(text) ? "freelance" : "job",
          source: "Mastodon",
          url: String(it.link),
          applyUrl: findApplyUrl(html, ["mastodon.social"], true),
          amountUsd: null,
          prizeLabel: "n/a",
          deadline: null,
          location: /remote|anywhere|worldwide/i.test(text) ? "remote" : "unknown",
          region: /\b(us|usa|united states|uk|europe|eu)[ -]?only\b/i.test(text) ? "US only" : "",
          skills: extractSkills(text, SKILL_VOCAB, "", 1),
          snippet: snippet(text),
          detail: detail(text),
          effort: "high",
          postedAt: it.pubDate ? new Date(it.pubDate) : null,
        });
      }
    }
    return [...out.values()];
  },
};
