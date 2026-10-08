import type { Config } from "./config.js";
import { buildChain, complete, type Providers, type Post, type ListModels } from "./fit.js";
import type { DigestItem } from "./store.js";

export type PitchKind = "pitch" | "letter";

function profileBlock(p: Config["profile"]): string {
  const pf = p.portfolio;
  return [
    `Candidate: ${pf.name || "the candidate"}${pf.site ? ` (${pf.site})` : ""}. About ${p.experience.years} years of experience. Strongest: ${pf.strongest}.`,
    `Skills: ${p.skills.join(", ")}.`,
    pf.summary && `Summary: ${pf.summary}`,
    pf.projects.length && `Projects:\n- ${pf.projects.join("\n- ")}`,
    pf.achievements.length && `Background:\n- ${pf.achievements.join("\n- ")}`,
  ].filter(Boolean).join("\n");
}

const RULES = [
  "Use ONLY facts in the candidate profile. Never invent employers, metrics, users, years or skills. Numbers must come from the profile verbatim.",
  "If the listing needs something the candidate lacks or is weak at (e.g. expert-level Rust or Solana security), do not bluff: either skip it or frame it honestly as something being deepened.",
  "Plain, specific, human tone. No clichés (\"passionate\", \"rockstar\", \"I am writing to express my interest\"). No emojis, no markdown.",
].join("\n");

export function pitchMessages(item: DigestItem, kind: PitchKind, cfg: Config) {
  const listing = [
    `Title: ${item.title}`, `Type: ${item.type}`, `Source: ${item.source}`, `Pay/prize: ${item.prizeLabel}`,
    item.region && `Region: ${item.region}`, item.deadline && `Deadline: ${item.deadline.slice(0, 10)}`,
    `Skills mentioned: ${item.skills.join(", ") || "n/a"}`, `Text: ${(item.detail ?? item.snippet).slice(0, 1500)}`,
  ].filter(Boolean).join("\n");
  const task = kind === "pitch"
    ? 'Write a quick application pitch with exactly this layout:\nLead with: <the 2 most relevant projects/roles from the profile and why, one line each>\nPitch: <3-4 sentences, max 70 words, ready to paste into an application box or DM>\nGap: <one line: the biggest requirement the candidate may not meet, and how to address it honestly; or "none">'
    : `Write a cover letter of 180-230 words for this listing. Structure: a specific opening that names the role and one concrete reason this candidate fits; one paragraph connecting 2 relevant projects to the listing's needs; one short paragraph on working style or growth areas, honest about any gap; a one-line close. Sign off with the candidate's name${cfg.profile.portfolio.site ? " and site" : ""}.`;
  return [
    { role: "system", content: `${task}\n${RULES}\n\n${profileBlock(cfg.profile)}` },
    { role: "user", content: listing },
  ];
}

/** Draft text for one digest item. Returns null if no provider answered. */
export async function draftPitch(
  item: DigestItem, kind: PitchKind, cfg: Config, keys: Providers, send?: Post, list?: ListModels,
): Promise<string | null> {
  const chain = await buildChain(cfg, keys, list);
  if (!chain.length) return null;
  return complete(chain, pitchMessages(item, kind, cfg), send);
}
