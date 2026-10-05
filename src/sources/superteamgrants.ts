import type { Source, RawOpp } from "../schema.js";
import { getJson } from "../http.js";
import { extractSkills, SKILL_VOCAB } from "../helpers.js";

interface Grant {
  slug: string; title: string; minReward?: number; maxReward?: number; token?: string;
  sponsor?: { name?: string }; totalApplications?: number;
}
const STABLE = new Set(["USDC", "USDT", "USDG", "USD", "PYUSD"]);
const fmt = (n: number) => n.toLocaleString("en-US");

/** Rolling grants from Superteam Earn. Chapter grants ("Superteam Nigeria") are region-locked to that country. */
export const superteamgrants: Source = {
  name: "Superteam Grants",
  async fetch() {
    const rows = await getJson<Grant[]>("https://earn.superteam.fun/api/grants/?take=100");
    return rows.map((g): RawOpp => {
      const max = g.maxReward ?? 0;
      const min = g.minReward ?? 0;
      const stable = STABLE.has((g.token ?? "").toUpperCase());
      const chapter = (g.sponsor?.name ?? "").replace(/^superteam\s*/i, "").trim(); // "" = global
      const label = max
        ? min && min !== max ? `$${fmt(min)}–$${fmt(max)}` : min === max ? `$${fmt(max)}` : `up to $${fmt(max)}`
        : "n/a";
      return {
        id: `stgrant:${g.slug}`,
        title: `${g.title} (${g.sponsor?.name ?? "Superteam"})`,
        type: "grant",
        source: "Superteam Grants",
        url: `https://earn.superteam.fun/grants/${g.slug}`,
        amountUsd: stable && max ? max : null,
        prizeLabel: stable || !max ? label : `${label} ${g.token ?? ""}`.trim(),
        deadline: null, // rolling
        location: "remote",
        region: chapter,
        skills: ["solana", "web3", ...extractSkills(g.title, SKILL_VOCAB)],
        snippet: "Rolling grant — apply any time",
        effort: "medium",
        postedAt: null,
      };
    });
  },
};
