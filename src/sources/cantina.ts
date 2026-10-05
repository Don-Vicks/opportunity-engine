import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { extractSkills, stripHtml, SKILL_VOCAB } from "../helpers.js";

interface Item {
  id: string; name: string; url: string; status: string; currencyCode?: string; totalRewardPot?: string | number;
  instructions?: string; assetGroups?: { name?: string; assets?: { name?: string }[] }[]; kind?: string;
  timeframe?: { end?: string | null }; company?: { name?: string };
}

/** Live Cantina bug bounties. Only programmes touching Rust/Solana/Anchor are kept (the rest is Solidity-only noise). */
export const cantina: Source = {
  name: "Cantina",
  async fetch() {
    const res = await getJson<{ items: Item[] }>("https://api.cantina.xyz/api/v0/opportunities?status=live&limit=100");
    const out: RawOpp[] = [];
    for (const b of res.items ?? []) {
      const assets = (b.assetGroups ?? []).flatMap((g) => [g.name ?? "", ...(g.assets ?? []).map((a) => a.name ?? "")]).join(" ");
      const skills = extractSkills(`${b.name} ${assets}`, SKILL_VOCAB, stripHtml(b.instructions ?? ""), 2);
      if (!skills.some((s) => ["rust", "solana", "anchor"].includes(s))) continue;
      const pot = Number(b.totalRewardPot ?? 0);
      const usd = /^(usdc|usdt|usd|dai)$/i.test(b.currencyCode ?? "") && pot > 0 ? pot : null;
      out.push({
        id: `cantina:${b.id}`,
        title: `${/bounty/i.test(b.name) ? b.name : `${b.name} bug bounty`} (${b.company?.name ?? "Cantina"})`,
        type: "bounty",
        source: "Cantina",
        url: b.url,
        amountUsd: usd,
        prizeLabel: usd ? `up to $${usd.toLocaleString("en-US")}` : "n/a",
        deadline: b.timeframe?.end ? new Date(b.timeframe.end) : null,
        location: "remote",
        skills,
        snippet: "Live security bounty — find and report vulnerabilities",
        effort: "high",
        postedAt: null,
      });
    }
    return out;
  },
};
