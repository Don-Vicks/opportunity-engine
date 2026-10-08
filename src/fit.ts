import type { Config } from "./config.js";
import type { Opportunity } from "./schema.js";

type Fit = NonNullable<Opportunity["fit"]>;
type Post = (url: string, key: string, body: unknown) => Promise<string>;
export interface Providers { groqKey?: string; openrouterKey?: string }

const BATCH = 12;

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

const post: Post = async (url, key, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
};

export function listingPayload(items: Opportunity[]) {
  return items.map((o, i) => ({
    i, type: o.type, title: o.title, source: o.source, pay: o.prizeLabel, region: o.region || undefined,
    skills: o.skills, text: o.snippet,
  }));
}

/**
 * Attach a qualified/stretch/not_a_fit verdict to each item. Tries Groq, then OpenRouter, per batch.
 * Never throws: on any failure the items simply stay unlabeled.
 */
export async function assessFit(items: Opportunity[], cfg: Config, keys: Providers, send: Post = post): Promise<void> {
  const chain: { name: string; url: string; key: string; model: string }[] = [];
  if (keys.groqKey) chain.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: keys.groqKey, model: cfg.ai.groqModel });
  if (keys.openrouterKey) chain.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: keys.openrouterKey, model: cfg.ai.openrouterModel });
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
