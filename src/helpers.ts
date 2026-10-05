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
  reactjs: "react", "react.js": "react", "node.js": "node", nodejs: "node",
  blockchain: "web3", crypto: "web3", defi: "web3", smartcontract: "web3", "smart contracts": "web3",
};
export const normSkill = (s: string) => {
  const k = s.toLowerCase().trim();
  return ALIASES[k] ?? k;
};

/** Find known skills mentioned in free text */
export function extractSkills(text: string, vocab: string[]): string[] {
  const t = ` ${text.toLowerCase()} `;
  const hits = new Set<string>();
  for (const v of vocab) {
    const re = new RegExp(`[^a-z0-9]${v.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
    if (re.test(t)) hits.add(normSkill(v));
  }
  for (const [alias, canon] of Object.entries(ALIASES)) {
    const re = new RegExp(`[^a-z0-9]${alias.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
    if (re.test(t)) hits.add(canon);
  }
  return [...hits];
}

export const SKILL_VOCAB = [
  "rust", "typescript", "javascript", "solana", "anchor", "react", "nextjs", "node", "web3",
  "python", "go", "golang", "java", "swift", "kotlin", "solidity", "ethereum", "evm", "smart contract",
  "frontend", "backend", "fullstack", "full-stack", "devops", "ai", "ml", "llm", "design", "wasm", "defi",
];

export const daysUntil = (d: Date, now = new Date()) => (d.getTime() - now.getTime()) / 86_400_000;
