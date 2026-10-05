import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { Opportunity } from "./schema.js";

const DIR = "data";
const SEEN = `${DIR}/seen.json`;
const STATE = `${DIR}/state.json`;
const HISTORY = `${DIR}/history.jsonl`;
const SEEN_TTL_DAYS = 120;

const read = <T>(p: string, fallback: T): T => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

export function loadSeen(now = new Date()): Set<string> {
  const m = read<Record<string, string>>(SEEN, {});
  const cutoff = now.getTime() - SEEN_TTL_DAYS * 86_400_000;
  return new Set(Object.entries(m).filter(([, t]) => new Date(t).getTime() > cutoff).map(([id]) => id));
}

export function saveSent(items: Opportunity[], now = new Date()) {
  mkdirSync(DIR, { recursive: true });
  const m = read<Record<string, string>>(SEEN, {});
  const cutoff = now.getTime() - SEEN_TTL_DAYS * 86_400_000;
  for (const k of Object.keys(m)) if (new Date(m[k]).getTime() <= cutoff) delete m[k];
  for (const o of items) m[o.id] = now.toISOString();
  writeFileSync(SEEN, JSON.stringify(m, null, 1));
  for (const o of items) appendFileSync(HISTORY, JSON.stringify(o) + "\n");
  writeFileSync(STATE, JSON.stringify({ lastSent: now.toISOString() }));
}

export function lastSent(): Date | null {
  const s = read<{ lastSent?: string }>(STATE, {});
  return s.lastSent ? new Date(s.lastSent) : null;
}
