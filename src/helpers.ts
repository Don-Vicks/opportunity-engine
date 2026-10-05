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

// ---------- region eligibility (for a candidate in Nigeria / WAT) ----------
const REGION_OK = /(worldwide|world wide|anywhere in the world|global|international|(?<!south )africa|nigeria|emea|\bwat\b|\bcet\b|\bgmt\b|\butc\b)/i;
const REGION_GENERIC = /^(remote|remoto|anywhere|worldwide|home ?office)$/i;
const REGION_BLOCK =
  /\bonly\b|\b(us|usa|u\.s\.?a?|united states|america|americas|canada|uk|united kingdom|europe|eu|latam|latin america|apac|asia|australia|new zealand|india|philippines|brazil|mexico|germany|france|spain|portugal|poland|israel|turkey|japan|singapore|argentina|colombia|south africa|uae|emirates)\b/i;

/**
 * Allow-list: a region string passes only if empty, generic ("Remote", "Anywhere"), or explicitly
 * worldwide / Africa / EMEA / a WAT-friendly timezone. Specific countries or cities are rejected.
 */
export function regionOk(region?: string): boolean {
  const r = (region ?? "").trim();
  if (!r || REGION_GENERIC.test(r)) return true;
  return REGION_OK.test(r);
}

/** For free-text headers (HN): returns the text only if it clearly restricts by region, else "" */
export const restrictiveRegion = (head: string): string =>
  REGION_BLOCK.test(head) && !REGION_OK.test(head) ? head : "";

const TECH_TITLE = /(engineer|developer|\bdev\b|programmer|architect|software|full.?stack|front.?end|back.?end|mobile|devops|\bsre\b|web3|blockchain|rust|react|next\.?js|nest\.?js|expo)/i;
export const isTechTitle = (title: string) => TECH_TITLE.test(title);

/** "$20k -$35k" / "120000" -> max annual USD, or null if unknown/hourly/non-USD */
export function parseSalaryUsd(text?: string | number | null): number | null {
  if (text == null) return null;
  const t = String(text).toLowerCase();
  if (/hour|\/hr|per hr|month/.test(t) || /[€£]/.test(t)) return null;
  const nums = [...t.matchAll(/(\d[\d,.]*)\s*(k)?/g)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  }).filter((n) => n >= 1000);
  return nums.length ? Math.max(...nums) : null;
}

const CLOSED = /(no longer accepting|position (has been |is )?filled|applications? (are |is )?closed|\[closed\]|already filled|has been filled|client (has )?(been )?(selected|hired|chosen))/i;
export const looksClosed = (text: string) => CLOSED.test(text);
