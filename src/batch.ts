import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Config } from "./config.js";
import { esc } from "./delivery/format.js";
import { readApps, readPending, priorApplication, sentLast24h } from "./applications.js";
import { composeLink, draftProblems, makePending, publicGuard, resolveMailer, savePending, type ApplyDeps } from "./apply.js";
import type { DigestItem } from "./store.js";

const DIR = () => process.env.DATA_DIR ?? "data";
const FILE = () => `${DIR()}/candidates.json`;
const CANDIDATE_TTL_DAYS = 3;

/** Email-ready, well-matched listings waiting to be drafted in the next morning batch. */
export interface Candidate extends DigestItem { addedAt: string }

export function readCandidates(): Candidate[] {
  try { return existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), "utf8")) : []; } catch { return []; }
}
export function writeCandidates(c: Candidate[]): void {
  mkdirSync(DIR(), { recursive: true });
  writeFileSync(FILE(), JSON.stringify(c, null, 1));
}

/** Does this digest item belong in the batch? Jobs/freelance with an email address and a good enough AI fit. */
export function isCandidate(i: DigestItem, cfg: Config): boolean {
  if ((i.type !== "job" && i.type !== "freelance") || !i.contactEmail) return false;
  if (!i.fit) return !cfg.ai.enabled; // AI is on but unlabeled (rate limit): wait for a labelled item
  return cfg.apply.batch.minFit === "stretch" ? i.fit.verdict !== "not_a_fit" : i.fit.verdict === "qualified";
}

/** Adds the latest digest's eligible items to the waiting list; drops entries older than 3 days. Returns how many were added. */
export function addCandidates(items: DigestItem[], cfg: Config, now = new Date()): number {
  if (!cfg.apply.batch.enabled) return 0;
  const keep = readCandidates().filter((c) => now.getTime() - new Date(c.addedAt).getTime() < CANDIDATE_TTL_DAYS * 86_400_000);
  const have = new Set(keep.map((c) => c.id));
  const add = items.filter((i) => isCandidate(i, cfg) && !have.has(i.id)).map((i): Candidate => ({ ...i, addedAt: now.toISOString() }));
  writeCandidates([...keep, ...add]);
  return add.length;
}

/** Day key (YYYY-MM-DD, WAT) once it is `hourWat` o'clock or later and no batch has gone out yet today; otherwise null. */
export function batchDue(now: Date, last: string | undefined, hourWat: number): string | null {
  const w = new Date(now.getTime() + 3_600_000); // WAT = UTC+1
  if (w.getUTCHours() < hourWat) return null;
  const key = w.toISOString().slice(0, 10);
  return last === key ? null : key;
}

/**
 * Drafts applications for the waiting listings and returns the Telegram message(s) to post.
 * Nothing is sent: each draft is stored as pending until you /send it (or /send all).
 */
export async function runBatch(d: ApplyDeps): Promise<string[]> {
  const now = d.now ?? new Date();
  const b = d.cfg.apply.batch;
  const waiting = readCandidates();
  if (!waiting.length) return [];
  const blocked = await publicGuard(d);
  if (blocked) return [`📬 ${blocked}`];

  const apps = readApps();
  const room = Math.max(0, Math.min(b.max, d.cfg.apply.dailyCap - sentLast24h(apps, now)));
  const fresh = waiting.filter((c) => !priorApplication(apps, c.id, c.contactEmail, now) && !readPending().some((p) => p.itemId === c.id));
  const hasSender = resolveMailer(d) !== null;

  const blocks: string[] = [];
  const used = new Set<string>();
  for (const c of fresh.slice(0, room)) {
    const p = await makePending(c, d, now);
    if (typeof p === "string") continue; // AI unavailable: leave it waiting for the next run
    savePending(p, now);
    used.add(c.id);
    const warn = draftProblems(p.body, d.cfg.profile.portfolio.name);
    blocks.push([
      `<b>${blocks.length + 1}. ${esc(c.title.slice(0, 80))}</b>`,
      `<b>To:</b> ${esc(p.to)}   <b>Subject:</b> ${esc(p.subject)}`,
      "",
      esc(p.body),
      "",
      ...(warn.length ? [`⚠️ Check before sending: ${esc(warn.join("; "))}`] : []),
      hasSender
        ? `/send ${p.code}  ·  /cancel ${p.code}`
        : `<a href="${esc(composeLink(p, d.cfg.apply.resumeUrl))}">Open in Gmail</a>  ·  after sending: /sent ${p.code}  ·  /cancel ${p.code}`,
    ].join("\n"));
  }
  // Listings we already handled (applied, or just drafted) leave the waiting list; the rest stay for a later run.
  writeCandidates(waiting.filter((c) => !used.has(c.id) && !priorApplication(apps, c.id, c.contactEmail, now)));
  if (!blocks.length) return [];

  const n = blocks.length;
  const head = [
    `<b>📬 Morning batch — ${n} draft${n > 1 ? "s" : ""}</b>`,
    "<b>Nothing has been sent.</b> Read each one, then:",
    hasSender ? "<code>/send all</code> sends all of them · <code>/send CODE</code> sends one · <code>/cancel CODE</code> drops one · <code>/cancel all</code> drops everything" : "Use the Gmail links, then log each with <code>/sent CODE</code>.",
    `<i>Drafts expire after 48h. Limit: ${d.cfg.apply.dailyCap} email applications per 24h.</i>`,
  ].join("\n");
  return [`${head}\n\n${blocks.join("\n\n──────────\n\n")}`];
}
