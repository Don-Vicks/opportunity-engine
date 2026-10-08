import type { Config } from "./config.js";
import type { Opportunity } from "./schema.js";

type Fit = NonNullable<Opportunity["fit"]>;
type Post = (url: string, key: string, body: unknown) => Promise<string>;
export interface Providers { groqKey?: string; openrouterKey?: string }

const BATCH = 8;
const TEXT_CAP = 1500;

export function systemPrompt(p: Config["profile"]): string {
  const pf = p.portfolio;
  return [
    "You screen opportunities (jobs, freelance gigs, hackathons, bounties, grants) for ONE candidate. Judge honestly whether they are qualified to apply and win/be hired.",
    `Candidate: ~${p.experience.years} years of professional experience. Strongest area: ${pf.strongest || "n/a"}. Skills: ${p.skills.join(", ")}.`,
    pf.summary && `Summary: ${pf.summary}`,
    pf.projects.length && `Projects:\n- ${pf.projects.join("\n- ")}`,
    pf.achievements.length && `Track record:\n- ${pf.achievements.join("\n- ")}`,
    "Verdicts: qualified = meets the stated requirements; stretch = plausible but a clear gap (level, years, a missing core skill); not_a_fit = requirements the candidate clearly lacks (wrong stack, far more seniority, specialised domain they have no evidence of).",
    "Only use what the listing says; never invent requirements. Reason: one short sentence naming the deciding factor.",
    'Reply with JSON only: {"results":[{"i":<number>,"verdict":"qualified|stretch|not_a_fit","reason":"..."}]}',
  ].filter(Boolean).join("\n");
}

/** Pull verdicts out of a model reply; tolerant of code fences and extra prose. */
export function parseFits(text: string): Map<number, Fit> {
  const out = new Map<number, Fit>();
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return out;
  let data: unknown;
  try { data = JSON.parse(json); } catch { return out; }
  const rows = (data as { results?: unknown }).results;
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Record<string, unknown>[]) {
    const verdict = String(r.verdict ?? "").toLowerCase().replace(/[\s-]/g, "_");
    if (typeof r.i === "number" && (verdict === "qualified" || verdict === "stretch" || verdict === "not_a_fit")) {
      out.set(r.i, { verdict, reason: String(r.reason ?? "").slice(0, 160) });
    }
  }
  return out;
}

type ListModels = (url: string, key: string) => Promise<string[]>;

const listModels: ListModels = async (url, key) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
};

/** First preferred model the provider actually serves; models get retired, so never trust a hardcoded name. */
export function pickModel(available: string[], preferred: string[], anyOf: RegExp[] = []): string {
  const have = new Set(available);
  const hit = preferred.find((m) => have.has(m));
  if (hit) return hit;
  for (const re of anyOf) { const m = available.find((id) => re.test(id)); if (m) return m; }
  return preferred[0];
}

const GROQ_FALLBACK = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

const post: Post = async (url, key, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
};

export function listingPayload(items: Opportunity[]) {
  return items.map((o, i) => ({
    i, type: o.type, title: o.title, source: o.source, pay: o.prizeLabel, region: o.region || undefined,
    skills: o.skills, text: (o.detail ?? o.snippet).slice(0, TEXT_CAP),
  }));
}

/**
 * Attach a qualified/stretch/not_a_fit verdict to each item. Tries Groq, then OpenRouter, per batch.
 * Never throws: on any failure the items simply stay unlabeled.
 */
export async function assessFit(items: Opportunity[], cfg: Config, keys: Providers, send: Post = post, list: ListModels = listModels): Promise<void> {
  const chain: { name: string; url: string; key: string; model: string }[] = [];
  const add = async (name: string, base: string, key: string, preferred: string[], anyOf: RegExp[] = []) => {
    const available = await list(`${base}/models`, key).catch((e) => { console.warn(`AI fit (${name}) model list failed: ${e.message}`); return []; });
    const model = pickModel(available, preferred, anyOf);
    console.log(`AI fit: ${name} → ${model}`);
    chain.push({ name, url: `${base}/chat/completions`, key, model });
  };
  if (keys.groqKey) await add("groq", "https://api.groq.com/openai/v1", keys.groqKey, [cfg.ai.groqModel, ...GROQ_FALLBACK]);
  if (keys.openrouterKey) await add("openrouter", "https://openrouter.ai/api/v1", keys.openrouterKey, [cfg.ai.openrouterModel], [/(gemma|llama|qwen|gpt-oss).*:free$/]);
  if (!chain.length) { console.warn("AI fit: no GROQ_API_KEY / OPENROUTER_API_KEY set, skipping"); return; }

  const system = systemPrompt(cfg.profile);
  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH);
    const messages = [{ role: "system", content: system }, { role: "user", content: JSON.stringify(listingPayload(batch)) }];
    for (const p of chain) {
      try {
        const reply = await send(p.url, p.key, { model: p.model, temperature: 0.1, messages, response_format: { type: "json_object" } });
        const fits = parseFits(reply);
        if (!fits.size) throw new Error("unparseable reply");
        fits.forEach((f, i) => { if (batch[i]) batch[i].fit = f; });
        break;
      } catch (e) {
        console.warn(`AI fit (${p.name}) failed: ${(e as Error).message}`);
      }
    }
  }
}

/** Apply the configured mode; items without a verdict are always kept. */
export function applyFitMode(items: Opportunity[], mode: Config["ai"]["mode"]): Opportunity[] {
  if (mode === "label") return items;
  return items.filter((o) => !o.fit || (mode === "strict" ? o.fit.verdict === "qualified" : o.fit.verdict !== "not_a_fit"));
}
