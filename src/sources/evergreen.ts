import type { Source, RawOpp } from "../schema.js";

/**
 * Standing grant programmes with no machine-readable feed. Surfaced once a month as a reminder
 * (the id includes YYYY-MM so de-duplication lets each reappear monthly). Every URL was checked to resolve.
 * Edit freely: add `{ slug, name, url, skills, note }`.
 */
const PROGRAMS = [
  { slug: "solana-foundation", name: "Solana Foundation Grants", url: "https://solana.org/grants-funding", skills: ["solana", "rust", "web3"], note: "Rolling grants + convertible grants for Solana ecosystem projects" },
  { slug: "superteam-grants", name: "Superteam Earn — All Grants", url: "https://earn.superteam.fun/grants", skills: ["solana", "web3"], note: "Instagrants and chapter grants (incl. Nigeria)" },
  { slug: "ethereum-esp", name: "Ethereum Foundation — Ecosystem Support Program", url: "https://esp.ethereum.foundation/", skills: ["web3", "rust", "typescript"], note: "Open grants for Ethereum public goods and tooling" },
  { slug: "web3-foundation", name: "Web3 Foundation Grants (Polkadot)", url: "https://web3.foundation/grants/", skills: ["rust", "web3"], note: "Open-source Polkadot/Substrate development grants" },
  { slug: "optimism", name: "Optimism Grants", url: "https://www.optimism.io/grants", skills: ["web3", "typescript"], note: "Grants and retro funding for the Superchain" },
  { slug: "nlnet", name: "NLnet Foundation — Open Source Funding", url: "https://nlnet.nl/propose/", skills: ["rust", "typescript"], note: "Funding for open-source internet infrastructure; periodic calls" },
];

const month = (d: Date) => d.toISOString().slice(0, 7);

export const evergreen: Source = {
  name: "Grant Programs",
  async fetch() {
    const m = month(new Date());
    return PROGRAMS.map((p): RawOpp => ({
      id: `evergreen:${p.slug}:${m}`,
      title: p.name,
      type: "grant",
      source: "Grant Programs",
      url: p.url,
      amountUsd: null,
      prizeLabel: "rolling",
      deadline: null,
      location: "remote",
      skills: p.skills,
      snippet: p.note,
      effort: "medium",
      postedAt: null,
    }));
  },
};
