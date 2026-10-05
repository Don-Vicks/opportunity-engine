import type { Source, RawOpp, OppType } from "../schema.js";
import { getJson } from "../http.js";
import { extractSkills, SKILL_VOCAB } from "../helpers.js";

interface Listing {
  id: string; title: string; slug: string; type: string; token?: string; rewardAmount?: number;
  deadline?: string; status?: string; sponsor?: { name?: string };
}

const STABLE = new Set(["USDC", "USDT", "USDG", "USD", "PYUSD"]);

export const superteam: Source = {
  name: "Superteam Earn",
  async fetch() {
    const out: RawOpp[] = [];
    for (const type of ["bounty", "project", "hackathon"]) {
      const rows = await getJson<Listing[]>(
        `https://earn.superteam.fun/api/listings/?context=all&type=${type}&take=50`,
      );
      for (const r of rows) {
        if (r.status && r.status !== "OPEN") continue;
        if ((r as { isWinnersAnnounced?: boolean }).isWinnersAnnounced) continue; // already awarded
        // Only stablecoin rewards can be trusted as USD; others stay unknown.
        const usd = r.rewardAmount && STABLE.has((r.token ?? "").toUpperCase()) ? r.rewardAmount : null;
        const t: OppType = r.type === "project" ? "freelance" : r.type === "hackathon" ? "hackathon" : "bounty";
        out.push({
          id: `superteam:${r.id}`,
          title: `${r.title} (${r.sponsor?.name ?? "Superteam"})`,
          type: t,
          source: "Superteam Earn",
          url: `https://earn.superteam.fun/listing/${r.slug}`,
          amountUsd: usd,
          prizeLabel: r.rewardAmount ? `${r.rewardAmount.toLocaleString("en-US")} ${r.token ?? ""}`.trim() : "n/a",
          deadline: r.deadline ? new Date(r.deadline) : null,
          location: "remote",
          skills: ["solana", "web3", ...extractSkills(r.title, SKILL_VOCAB)],
          snippet: r.sponsor?.name ?? "",
          effort: t === "freelance" ? "high" : "medium",
          postedAt: null,
        });
      }
    }
    return out;
  },
};
