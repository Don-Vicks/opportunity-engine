import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { Opportunity, OppType } from "./schema.js";

const DIR = () => process.env.DATA_DIR ?? "data";
const f = (name: string) => `${DIR()}/${name}`;
const SEEN_TTL_DAYS = 120;
const REMIND_TYPES: OppType[] = ["hackathon", "bounty", "grant", "freelance"];

const read = <T>(p: string, fallback: T): T => {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback; } catch { return fallback; }
};
const write = (p: string, v: unknown) => { mkdirSync(DIR(), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 1)); };

/** Compact copy kept so a last-call reminder can be rendered without refetching. */
export interface Lite {
  title: string; url: string; applyUrl?: string; prizeLabel: string; type: OppType; source: string;
}
export interface SeenEntry { t: string; d?: string; r?: 1; o?: Lite }

/** Reads seen.json; legacy entries (id -> ISO string) are upgraded on the fly. */
export function loadSeenMap(): Record<string, SeenEntry> {
  const raw = read<Record<string, string | SeenEntry>>(f("seen.json"), {});
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? { t: v } : v]));
}

export function loadSeen(now = new Date()): Set<string> {
  const cutoff = now.getTime() - SEEN_TTL_DAYS * 86_400_000;
  return new Set(Object.entries(loadSeenMap()).filter(([, e]) => new Date(e.t).getTime() > cutoff).map(([id]) => id));
}

export function saveSent(items: Opportunity[], now = new Date()) {
  const m = loadSeenMap();
  const cutoff = now.getTime() - SEEN_TTL_DAYS * 86_400_000;
  for (const k of Object.keys(m)) if (new Date(m[k].t).getTime() <= cutoff) delete m[k];
  for (const o of items) {
    m[o.id] = {
      t: now.toISOString(),
      ...(o.deadline ? { d: o.deadline.toISOString() } : {}),
      o: { title: o.title, url: o.url, applyUrl: o.applyUrl, prizeLabel: o.prizeLabel, type: o.type, source: o.source },
    };
  }
  write(f("seen.json"), m);
  for (const o of items) appendFileSync(f("history.jsonl"), JSON.stringify(o) + "\n");
}

export interface Reminder { id: string; deadline: Date; lite: Lite }

/** Items sent earlier (>12h ago) whose deadline falls within the next `withinHours`, not yet reminded. */
export function dueReminders(now = new Date(), withinHours = 48): Reminder[] {
  const out: Reminder[] = [];
  for (const [id, e] of Object.entries(loadSeenMap())) {
    if (!e.d || e.r || !e.o || !REMIND_TYPES.includes(e.o.type)) continue;
    const left = (new Date(e.d).getTime() - now.getTime()) / 3_600_000;
    const age = (now.getTime() - new Date(e.t).getTime()) / 3_600_000;
    if (left > 1 && left <= withinHours && age >= 12) out.push({ id, deadline: new Date(e.d), lite: e.o });
  }
  return out.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

export function markReminded(ids: string[]) {
  if (!ids.length) return;
  const m = loadSeenMap();
  for (const id of ids) if (m[id]) m[id].r = 1;
  write(f("seen.json"), m);
}

/** Upcoming deadlines among everything sent (for the weekly summary). */
export function upcoming(now = new Date(), days = 7): Reminder[] {
  return Object.entries(loadSeenMap())
    .filter(([, e]) => e.d && e.o && new Date(e.d).getTime() > now.getTime() && new Date(e.d).getTime() <= now.getTime() + days * 86_400_000)
    .map(([id, e]) => ({ id, deadline: new Date(e.d!), lite: e.o! }))
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

export function readHistory(sinceDays: number, now = new Date()): Opportunity[] {
  if (!existsSync(f("history.jsonl"))) return [];
  const cutoff = now.getTime() - sinceDays * 86_400_000;
  return readFileSync(f("history.jsonl"), "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as Opportunity; } catch { return null; } })
    .filter((o): o is Opportunity => !!o && new Date(o.foundAt).getTime() >= cutoff);
}

// ---- generic state / health / prefs ----
export interface State { lastSent?: string; lastWeekly?: string; tgOffset?: number }
export const readState = () => read<State>(f("state.json"), {});
export const writeState = (patch: Partial<State>) => write(f("state.json"), { ...readState(), ...patch });

export interface Health { zero: number; fail: number; lastOk?: string; lastErr?: string; alerted?: boolean }
export const readHealth = () => read<Record<string, Health>>(f("health.json"), {});
export const writeHealth = (h: Record<string, Health>) => write(f("health.json"), h);

export interface Prefs { mute: string[]; boost: string[] }
export const readPrefs = () => read<Prefs>(f("prefs.json"), { mute: [], boost: [] });
export const writePrefs = (p: Prefs) => write(f("prefs.json"), p);
