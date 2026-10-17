import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { OppType } from "./schema.js";

const DIR = () => process.env.DATA_DIR ?? "data";
const f = (name: string) => `${DIR()}/${name}`;
const read = <T>(p: string, fallback: T): T => {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback; } catch { return fallback; }
};
const write = (p: string, v: unknown) => { mkdirSync(DIR(), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 1)); };

export const STATUSES = ["sent", "applied", "replied", "interview", "rejected", "offer"] as const;
export type Status = (typeof STATUSES)[number];

export interface AppRecord {
  id: string;              // A1, A2, ...
  itemId: string;          // digest item id (dedupe)
  title: string; source: string; type: OppType; url: string;
  via: "email" | "manual";
  to?: string; subject?: string; body?: string;
  status: Status;
  at: string;              // when it was sent / marked applied
  updated: string;
}

/** A drafted-but-unsent email application waiting for /send <code>. */
export interface Pending {
  code: string; itemId: string; title: string; source: string; type: OppType; url: string;
  to: string; subject: string; body: string; createdAt: string;
}
export const PENDING_TTL_HOURS = 48;

export const readApps = () => read<AppRecord[]>(f("applications.json"), []);
export const writeApps = (a: AppRecord[]) => write(f("applications.json"), a);
export const readPending = () => read<Pending[]>(f("pending-apply.json"), []);
export const writePending = (p: Pending[]) => write(f("pending-apply.json"), p);

export const nextAppId = (apps: AppRecord[]) => `A${apps.reduce((m, a) => Math.max(m, Number(a.id.slice(1)) || 0), 0) + 1}`;

export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const FREE_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|proton(mail)?|icloud|me|aol)\./i;

/** An earlier application to the same listing or the same company mail domain within 30 days, if any. */
export function priorApplication(apps: AppRecord[], itemId: string, to: string | undefined, now = new Date()): AppRecord | undefined {
  const cutoff = now.getTime() - 30 * 86_400_000;
  return apps.find((a) =>
    a.itemId === itemId ||
    (!!to && !!a.to && new Date(a.at).getTime() > cutoff && domainOf(a.to) === domainOf(to) && !FREE_MAIL.test(domainOf(to))));
}

export function sentLast24h(apps: AppRecord[], now = new Date()): number {
  return apps.filter((a) => a.via === "email" && now.getTime() - new Date(a.at).getTime() < 86_400_000).length;
}

export function funnel(apps: AppRecord[]) {
  const n = apps.length;
  const count = (...s: Status[]) => apps.filter((a) => s.includes(a.status)).length;
  const responded = count("replied", "interview", "rejected", "offer");
  const interviews = count("interview", "offer");
  const bySource = new Map<string, { sent: number; interviews: number }>();
  for (const a of apps) {
    const e = bySource.get(a.source) ?? { sent: 0, interviews: 0 };
    e.sent++;
    if (a.status === "interview" || a.status === "offer") e.interviews++;
    bySource.set(a.source, e);
  }
  const pct = (x: number) => (n ? `${Math.round((x / n) * 100)}%` : "-");
  return { total: n, sent: count("sent", "applied"), replied: count("replied"), interview: count("interview"), rejected: count("rejected"), offer: count("offer"), responded, interviews, responseRate: pct(responded), interviewRate: pct(interviews), bySource };
}
