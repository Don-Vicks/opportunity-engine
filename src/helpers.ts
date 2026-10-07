export const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

export const snippet = (s: string, n = 450) => {
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

// ---------- direct apply links ----------
const ATS = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|breezy\.hr|bamboohr\.com|recruitee\.com|personio\.(com|de)|teamtailor\.com|gem\.com|jobvite\.com|icims\.com|workday(jobs)?\.com|myworkdayjobs\.com|rippling\.com|dover\.com|pinpointhq\.com|join\.com|homerun\.co|notion\.site|tally\.so|typeform\.com|airtable\.com|forms\.gle|docs\.google\.com\/forms|jobs?\.[a-z0-9-]+\.[a-z]+|careers?\.[a-z0-9-]+\.[a-z]+|wellfound\.com\/(jobs|l)\/)/i;
const NOT_APPLY = /(linkedin\.com\/(company|in|school)|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|t\.me|discord\.|glassdoor|crunchbase|\.(png|jpe?g|gif|svg|webp)(\?|$)|mailto:|\/privacy|\/terms)/i;

export const decodeEntities = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

export function cleanUrl(u: string): string {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref$|source$|gh_src$|src$|fbclid|gclid)/i.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/[).,;]+$/, "");
  } catch { return u; }
}

/**
 * Best-guess employer/ATS application URL inside a listing's HTML/text.
 * Scores ATS domains, "apply" anchor text and apply-ish paths; ignores the source site itself.
 */
export function findApplyUrl(raw: string, ownHosts: string[] = [], lenient = false): string | undefined {
  const html = /&lt;a\s|&lt;p&gt;/i.test(raw) ? decodeEntities(raw) : raw;
  const cands = new Map<string, number>();
  const add = (url: string, ctx: string) => {
    if (!/^https?:\/\//i.test(url) || NOT_APPLY.test(url)) return;
    let host = "";
    try { host = new URL(url).host.toLowerCase(); } catch { return; }
    if (ownHosts.some((h) => host === h || host.endsWith("." + h))) return;
    let sc = lenient ? 2 : 0; // lenient: free-text posts where any employer link is the apply target
    if (ATS.test(url)) sc += 10;
    if (/apply|application|interested/i.test(ctx)) sc += 5;
    if (/apply|job|career|position|opening|hiring|vacanc/i.test(new URL(url).pathname)) sc += 2;
    if (sc > 0) cands.set(cleanUrl(url), Math.max(sc, cands.get(cleanUrl(url)) ?? 0));
  };
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(decodeEntities(m[1]), stripHtml(m[2]));
  const text = html.replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) add(m[0], text.slice(Math.max(0, m.index! - 60), m.index));
  const best = [...cands].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= (lenient ? 2 : 5) ? best[0] : undefined;
}
