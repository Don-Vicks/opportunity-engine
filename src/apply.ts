import { createHash } from "node:crypto";
import type { Config } from "./config.js";
import { env as realEnv } from "./config.js";
import { esc } from "./delivery/format.js";
import { sendApplication, type MailFn } from "./delivery/email.js";
import { draftPitch } from "./pitch.js";
import type { Providers } from "./fit.js";
import { readLastDigest, type DigestItem } from "./store.js";
import {
  readApps, writeApps, readPending, writePending, nextAppId, priorApplication, sentLast24h, funnel,
  PENDING_TTL_HOURS, type AppRecord, type Pending, type Status,
} from "./applications.js";

export interface ApplyDeps {
  cfg: Config;
  keys: Providers;
  gmail?: { user?: string; pass?: string };
  now?: Date;
  /** injectable for tests */
  draft?: (item: DigestItem, cfg: Config, keys: Providers) => Promise<string | null>;
  mail?: MailFn;
  fetchResume?: (url: string) => Promise<Buffer>;
}

const MAX_RESUME_BYTES = 5_000_000;

export async function fetchResumePdf(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`resume HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_RESUME_BYTES) throw new Error("resume is larger than 5 MB");
  if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("resume URL did not return a PDF");
  return buf;
}

const code = (itemId: string, now: Date) => createHash("sha1").update(itemId + now.getTime()).digest("hex").slice(0, 4);
const roleOf = (title: string) => title.split(/\s+@\s+/)[0].replace(/\s+/g, " ").trim().slice(0, 80);

/** "/apply N": draft an email application for item N of the latest digest and show a preview. Sends nothing. */
export async function applyPreview(n: number, d: ApplyDeps): Promise<string> {
  const now = d.now ?? new Date();
  const item = readLastDigest()[n - 1];
  if (!item) return esc(`No item #${n} in the latest digest.`);
  if (item.type !== "job" && item.type !== "freelance") return esc(`#${n} is a ${item.type}; email applications are for jobs and freelance gigs. Use the link: ${item.applyUrl ?? item.url}`);
  if (!item.contactEmail) {
    return esc(`#${n} has no email address in the listing, so I can't send it for you. Apply here: ${item.applyUrl ?? item.url}\nI can write the text with /letter ${n} (or /pitch ${n}); after you apply, log it with /applied ${n}.`);
  }
  const prior = priorApplication(readApps(), item.id, item.contactEmail, now);
  if (prior) return esc(`Already applied: ${prior.id} (${prior.title}) on ${prior.at.slice(0, 10)}. Not drafting another.`);

  const body = await (d.draft ?? ((i, c, k) => draftPitch(i, "email", c, k)))(item, d.cfg, d.keys).catch(() => null);
  if (!body?.trim()) return esc(`Couldn't draft #${n} right now (AI providers unavailable). Try again later.`);

  const pf = d.cfg.profile.portfolio;
  const subject = `Application: ${roleOf(item.title)}${pf.name ? ` - ${pf.name}` : ""}`;
  const pending: Pending = {
    code: code(item.id, now), itemId: item.id, title: item.title, source: item.source, type: item.type, url: item.applyUrl ?? item.url,
    to: item.contactEmail, subject, body: body.trim(), createdAt: now.toISOString(),
  };
  const keep = readPending().filter((p) => p.itemId !== item.id && now.getTime() - new Date(p.createdAt).getTime() < PENDING_TTL_HOURS * 3_600_000);
  writePending([...keep, pending]);

  return [
    `<b>✉️ Draft application — not sent</b>`,
    `<b>To:</b> ${esc(pending.to)}`,
    `<b>Subject:</b> ${esc(pending.subject)}`,
    `<b>Attachment:</b> ${d.cfg.apply.resumeUrl ? "resume (PDF)" : "none (set apply.resumeUrl)"}`,
    "",
    esc(pending.body),
    "",
    `Send it: /send ${pending.code}   ·   Discard: /cancel ${pending.code}`,
    `<i>Expires in ${PENDING_TTL_HOURS}h. Exactly this text will be sent.</i>`,
  ].join("\n");
}

/** "/send CODE": send a previously previewed application, exactly as previewed. */
export async function applySend(codeArg: string, d: ApplyDeps): Promise<string> {
  const now = d.now ?? new Date();
  const pend = readPending();
  const p = pend.find((x) => x.code === codeArg.toLowerCase());
  if (!p) return esc(`No pending draft with code ${codeArg}. Drafts expire after ${PENDING_TTL_HOURS}h; run /apply again.`);
  if (now.getTime() - new Date(p.createdAt).getTime() > PENDING_TTL_HOURS * 3_600_000) {
    writePending(pend.filter((x) => x.code !== p.code));
    return esc(`Draft ${p.code} expired. Run /apply again.`);
  }
  const g = d.gmail ?? { user: realEnv.gmailUser, pass: realEnv.gmailPass };
  if (!g.user || !g.pass) return esc("Gmail isn't configured. Add the GMAIL_USER and GMAIL_APP_PASSWORD repo secrets, then /send again.");
  if (!d.cfg.apply.resumeUrl) return esc("Set apply.resumeUrl in config.yaml so the resume can be attached.");

  const apps = readApps();
  const prior = priorApplication(apps, p.itemId, p.to, now);
  if (prior) { writePending(pend.filter((x) => x.code !== p.code)); return esc(`Already applied: ${prior.id} (${prior.title}). Draft discarded.`); }
  if (sentLast24h(apps, now) >= d.cfg.apply.dailyCap) return esc(`Daily cap reached (${d.cfg.apply.dailyCap} email applications per 24h). Try again later, or raise apply.dailyCap.`);

  let pdf: Buffer;
  try { pdf = await (d.fetchResume ?? fetchResumePdf)(d.cfg.apply.resumeUrl); }
  catch (e) { return esc(`Couldn't fetch the resume (${(e as Error).message}). Nothing was sent.`); }

  try {
    await (d.mail ?? sendApplication)({
      user: g.user, pass: g.pass, fromName: d.cfg.apply.fromName || undefined, replyTo: d.cfg.apply.replyTo || undefined,
      to: p.to, subject: p.subject, text: p.body,
      attachment: { filename: `${(d.cfg.profile.portfolio.name || "Resume").replace(/\s+/g, "")}-Resume.pdf`, content: pdf },
    });
  } catch (e) {
    return esc(`Sending failed (${(e as Error).message}). Nothing was recorded; the draft is still pending.`);
  }

  const rec: AppRecord = {
    id: nextAppId(apps), itemId: p.itemId, title: p.title, source: p.source, type: p.type, url: p.url,
    via: "email", to: p.to, subject: p.subject, body: p.body, status: "sent", at: now.toISOString(), updated: now.toISOString(),
  };
  writeApps([...apps, rec]);
  writePending(pend.filter((x) => x.code !== p.code));
  return `✅ <b>Sent</b> to ${esc(p.to)} — logged as <b>${rec.id}</b>.\nTrack it: /interview ${rec.id} · /rejected ${rec.id} · /replied ${rec.id}`;
}

export function applyCancel(codeArg: string): string {
  const pend = readPending();
  if (!pend.some((x) => x.code === codeArg.toLowerCase())) return esc(`No pending draft with code ${codeArg}.`);
  writePending(pend.filter((x) => x.code !== codeArg.toLowerCase()));
  return esc(`Discarded draft ${codeArg}.`);
}

/** "/applied N": log an application you made yourself (form/ATS) for item N of the latest digest. */
export function markApplied(n: number, now = new Date()): string {
  const item = readLastDigest()[n - 1];
  if (!item) return esc(`No item #${n} in the latest digest.`);
  const apps = readApps();
  const prior = priorApplication(apps, item.id, undefined, now);
  if (prior) return esc(`Already logged as ${prior.id}.`);
  const rec: AppRecord = {
    id: nextAppId(apps), itemId: item.id, title: item.title, source: item.source, type: item.type, url: item.applyUrl ?? item.url,
    via: "manual", status: "applied", at: now.toISOString(), updated: now.toISOString(),
  };
  writeApps([...apps, rec]);
  return `📝 Logged <b>${rec.id}</b>: ${esc(item.title.slice(0, 80))}`;
}

export function setStatus(status: Status, id: string, now = new Date()): string {
  const apps = readApps();
  const a = apps.find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (!a) return esc(`No application ${id}. See /apps.`);
  a.status = status; a.updated = now.toISOString();
  writeApps(apps);
  return `📌 ${a.id} → <b>${status}</b>: ${esc(a.title.slice(0, 70))}`;
}

const STATUS_ICON: Record<Status, string> = { sent: "📤", applied: "📝", replied: "💬", interview: "🎤", rejected: "✖️", offer: "🎉" };

export function listApps(now = new Date()): string {
  const apps = readApps().slice(-12).reverse();
  if (!apps.length) return esc("No applications yet. Try /apply <n> on a digest item.");
  return ["<b>Recent applications</b>", ...apps.map((a) => {
    const days = Math.floor((now.getTime() - new Date(a.at).getTime()) / 86_400_000);
    return `${STATUS_ICON[a.status]} <b>${a.id}</b> ${esc(a.status)} · ${esc(a.title.slice(0, 60))} · ${days}d`;
  })].join("\n");
}

export function statsText(): string {
  const f = funnel(readApps());
  if (!f.total) return esc("No applications logged yet.");
  const top = [...f.bySource].sort((a, b) => b[1].interviews - a[1].interviews || b[1].sent - a[1].sent).slice(0, 4)
    .map(([s, e]) => `${esc(s)}: ${e.sent} sent, ${e.interviews} interviews`);
  return [
    "<b>📈 Application funnel</b>",
    `Applications: <b>${f.total}</b>  (awaiting reply: ${f.sent})`,
    `Replies: <b>${f.responded}</b> (${f.responseRate})  ·  Interviews: <b>${f.interviews}</b> (${f.interviewRate})  ·  Offers: <b>${f.offer}</b>`,
    `Rejected: ${f.rejected}`,
    ...(top.length ? ["", "<b>By source</b>", ...top] : []),
  ].join("\n");
}

/** Routes the application-related Telegram commands. Returns null if `text` is not one of them. */
export async function routeApplyCommand(text: string, d: ApplyDeps): Promise<string | null> {
  const m = text.trim().match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim().split(/\s+/)[0] ?? "";
  switch (cmd) {
    case "apply": return /^\d+$/.test(arg) ? applyPreview(Number(arg), d) : esc("Usage: /apply <n>  (n = number of the item in the latest digest)");
    case "send": return arg ? applySend(arg, d) : esc("Usage: /send <code>  (code from the draft preview)");
    case "cancel": return arg ? applyCancel(arg) : esc("Usage: /cancel <code>");
    case "applied": return /^\d+$/.test(arg) ? markApplied(Number(arg), d.now) : esc("Usage: /applied <n>  (logs an application you made yourself)");
    case "apps": return listApps(d.now);
    case "stats": case "funnel": return statsText();
    case "replied": case "interview": case "rejected": case "offer":
      return arg ? setStatus(cmd as Status, arg, d.now) : esc(`Usage: /${cmd} <id>  (e.g. /${cmd} A3)`);
    default: return null;
  }
}
