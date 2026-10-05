export const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

export const snippet = (s: string, n = 160) => {
  const t = stripHtml(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

const ALIASES: Record<string, string> = {
  ts: "typescript", js: "javascript", rs: "rust", "next.js": "nextjs", next: "nextjs",
  reactjs: "react", "react native": "expo", "react-native": "expo", reactnative: "expo", "expo.js": "expo",
  "express.js": "express", expressjs: "express", "nest.js": "nestjs", nest: "nestjs", "next js": "nextjs", "react.js": "react", "node.js": "node", nodejs: "node",
  blockchain: "web3", crypto: "web3", defi: "web3", smartcontract: "web3", "smart contracts": "web3",
};
export const normSkill = (s: string) => {
  const k = s.toLowerCase().trim();
  return ALIASES[k] ?? k;
};

const esc = (x: string) => x.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
const countOf = (text: string, term: string) =>
  (text.match(new RegExp(`(?<![a-z0-9])${esc(term)}(?![a-z0-9])`, "g")) ?? []).length;

/**
 * Find known skills in a listing. A skill counts if it is in the title, or appears
 * at least `minBodyHits` times in the body (filters out boilerplate/one-off mentions).
 */
export function extractSkills(title: string, vocab: string[], body = "", minBodyHits = 3): string[] {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  const terms = new Set([...vocab, ...Object.keys(ALIASES)]);
  const hits = new Set<string>();
  for (const term of terms) {
    if (countOf(t, term) > 0 || countOf(b, term) >= minBodyHits) hits.add(normSkill(term));
  }
  return [...hits];
}

export const SKILL_VOCAB = [
  "expo", "nestjs", "rust", "typescript", "javascript", "solana", "anchor", "react", "nextjs", "node", "web3",
  "python", "go", "golang", "java", "swift", "kotlin", "solidity", "ethereum", "evm", "smart contract",
  "frontend", "backend", "fullstack", "full-stack", "devops", "ai", "ml", "llm", "design", "wasm", "defi",
];

export const daysUntil = (d: Date, now = new Date()) => (d.getTime() - now.getTime()) / 86_400_000;
