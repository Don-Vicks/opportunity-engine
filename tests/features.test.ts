import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSent, dueReminders, markReminded, loadSeen, loadSeenMap } from "../src/store.js";
import { updateHealth, FAIL_LIMIT, ZERO_LIMIT } from "../src/health.js";
import { applyCommand } from "../src/prefs.js";
import { weeklyDue } from "../src/weekly.js";
import { formatTelegram } from "../src/delivery/format.js";
import { loadConfig } from "../src/config.js";
import { keep } from "../src/filter.js";
import { rank } from "../src/ranking.js";
import type { Opportunity, RawOpp } from "../src/schema.js";

const H = 3_600_000;
const opp = (id: string, deadlineInH: number | null, now: Date, type: Opportunity["type"] = "bounty"): Opportunity => ({
  id, title: `Title ${id}`, type, source: "Src", url: `https://x.co/${id}`, amountUsd: 500, prizeLabel: "$500",
  deadline: deadlineInH == null ? null : new Date(now.getTime() + deadlineInH * H), location: "remote", skills: [],
  snippet: "", effort: null, postedAt: null, score: 0.7, foundAt: now,
});

describe("last-call reminders", () => {
  beforeEach(() => { process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oe-")); });

  it("reminds once for items sent >12h ago closing within 48h", () => {
    const sent = new Date("2026-10-05T00:00:00Z");
    saveSent([opp("a", 60, sent), opp("b", 200, sent), opp("c", null, sent), opp("j", 60, sent, "job")], sent);
    const t = new Date(sent.getTime() + 24 * H); // a closes in 36h
    const due = dueReminders(t);
    expect(due.map((r) => r.id)).toEqual(["a"]); // b too far, c no deadline, j is a job
    markReminded(["a"]);
    expect(dueReminders(t)).toHaveLength(0);
  });
  it("does not remind fresh items or expired ones", () => {
    const sent = new Date("2026-10-05T00:00:00Z");
    saveSent([opp("fresh", 30, sent), opp("gone", 10, sent)], sent);
    expect(dueReminders(new Date(sent.getTime() + 2 * H))).toHaveLength(0); // too soon after send
    expect(dueReminders(new Date(sent.getTime() + 20 * H))).toHaveLength(1); // 'gone' already closed (<1h left)
  });
  it("upgrades legacy seen.json entries", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(process.env.DATA_DIR!, "seen.json"), JSON.stringify({ old: new Date().toISOString() }));
    expect(loadSeen().has("old")).toBe(true);
    expect(loadSeenMap().old.t).toBeTruthy();
  });
  it("renders the LAST CALL section", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    const msg = formatTelegram([], [], now, [{ id: "a", deadline: new Date(now.getTime() + 20 * H), lite: { title: "Big <Bounty>", url: "https://x.co/a", prizeLabel: "$500", type: "bounty", source: "Src" } }]);
    expect(msg).toContain("LAST CALL");
    expect(msg).toContain("Closes in 20h");
    expect(msg).toContain("Big &lt;Bounty&gt;");
  });
});

describe("source health", () => {
  const now = new Date();
  it("alerts once after repeated failures, then on recovery", () => {
    let h = {};
    let alerts: string[] = [];
    for (let i = 0; i < FAIL_LIMIT - 1; i++) ({ health: h, alerts } = updateHealth(h, [{ name: "S", error: "boom" }], now));
    expect(alerts).toHaveLength(0);
    ({ health: h, alerts } = updateHealth(h, [{ name: "S", error: "boom" }], now));
    expect(alerts).toHaveLength(1);
    ({ health: h, alerts } = updateHealth(h, [{ name: "S", error: "boom" }], now));
    expect(alerts).toHaveLength(0); // no repeat
    ({ alerts } = updateHealth(h, [{ name: "S", count: 5 }], now));
    expect(alerts[0]).toContain("back");
  });
  it("alerts on a long empty streak", () => {
    let h = {}; let alerts: string[] = [];
    for (let i = 0; i < ZERO_LIMIT; i++) ({ health: h, alerts } = updateHealth(h, [{ name: "Z", count: 0 }], now));
    expect(alerts[0]).toContain("nothing");
  });
});

describe("telegram commands", () => {
  const empty = { mute: [], boost: [] };
  it("mute/boost/unmute", () => {
    let r = applyCommand("/mute Shopify", empty)!;
    expect(r.prefs.mute).toEqual(["shopify"]);
    r = applyCommand("/boost solana", r.prefs)!;
    expect(r.prefs.boost).toEqual(["solana"]);
    r = applyCommand("/unmute shopify", r.prefs)!;
    expect(r.prefs.mute).toEqual([]);
  });
  it("ignores non-commands and unknown commands", () => {
    expect(applyCommand("hello", empty)).toBeNull();
    expect(applyCommand("/frobnicate", empty)).toBeNull();
  });
  it("mute filters and boost ranks", () => {
    const cfg = loadConfig(); const now = new Date("2026-10-05T00:00:00Z");
    const o: RawOpp = { id: "1", title: "Senior Shopify Developer", type: "job", source: "x", url: "u", amountUsd: null, prizeLabel: "n/a", deadline: null, location: "remote", skills: ["react"], snippet: "", effort: "high", postedAt: null };
    expect(keep(o, cfg, new Set(), now)).toBe(true);
    expect(keep(o, cfg, new Set(), now, { mute: ["shopify"], boost: [] })).toBe(false);
    const base = rank([o], cfg.profile, now)[0].score;
    expect(rank([o], cfg.profile, now, { mute: [], boost: ["shopify"] })[0].score).toBeGreaterThan(base);
  });
});

describe("weekly summary window", () => {
  it("fires Monday after 08:00 WAT once", () => {
    const mon9 = new Date("2026-10-05T08:30:00Z"); // 09:30 WAT Monday
    expect(weeklyDue(mon9, undefined)).toBe("2026-10-05");
    expect(weeklyDue(mon9, "2026-10-05")).toBeNull();
    expect(weeklyDue(new Date("2026-10-05T06:00:00Z"), undefined)).toBeNull(); // 07:00 WAT, too early
    expect(weeklyDue(new Date("2026-10-06T10:00:00Z"), undefined)).toBeNull(); // Tuesday
  });
});

import { overLevel, yearsRequired } from "../src/seniority.js";
import { parseFits, assessFit, applyFitMode, pickModel, retryAfterMs, complete } from "../src/fit.js";

describe("level gate", () => {
  const cfg = loadConfig();
  const exp = cfg.profile.experience;
  it("drops staff/principal/lead/architect titles", () => {
    for (const t of ["Staff Software Engineer: Perpetuals @ Consensys", "Principal Engineer", "Tech Lead, Backend", "Lead Backend Engineer", "Solutions Architect"])
      expect(overLevel(t, "", exp)).toBeTruthy();
  });
  it("keeps junior/mid/senior titles when allowed", () => {
    for (const t of ["Junior Frontend Developer", "Backend Engineer", "Senior NestJS Developer"]) expect(overLevel(t, "", exp)).toBeNull();
    expect(overLevel("Senior NestJS Developer", "", { ...exp, allowSenior: false })).toBeTruthy();
  });
  it("reads years of experience", () => {
    expect(yearsRequired("We want 7+ years of experience with Node")).toBe(7);
    expect(yearsRequired("5-8 years of professional backend experience")).toBe(5);
    expect(yearsRequired("Experience: 6 years")).toBe(6);
    expect(yearsRequired("We have been in business for 10 years")).toBeNull();
    expect(overLevel("Backend Engineer", "Requires 8+ years of experience", exp)).toMatch(/8/);
    expect(overLevel("Backend Engineer", "3+ years of experience", exp)).toBeNull();
  });
});

describe("AI fit", () => {
  const cfg = loadConfig();
  const mk = (id: string) => ({ ...opp(id, null, new Date()), type: "job" as const });
  it("parses fenced / noisy replies and ignores bad verdicts", () => {
    const m = parseFits('Sure!\n```json\n{"results":[{"i":0,"verdict":"Not-a-fit","reason":"Needs 10y"},{"i":1,"verdict":"maybe","reason":"x"}]}\n```');
    expect(m.get(0)).toEqual({ verdict: "not_a_fit", reason: "Needs 10y" });
    expect(m.has(1)).toBe(false);
    expect(parseFits("garbage").size).toBe(0);
  });
  it("falls back from Groq to OpenRouter and labels items", async () => {
    const items = [mk("a"), mk("b")];
    const calls: string[] = [];
    await assessFit(items, cfg, { groqKey: "g", openrouterKey: "o" }, async (url) => {
      calls.push(url);
      if (url.includes("groq")) throw new Error("HTTP 429");
      return '{"results":[{"i":0,"verdict":"qualified","reason":"ok"},{"i":1,"verdict":"stretch","reason":"gap"}]}';
    }, async () => []);
    expect(calls).toHaveLength(2);
    expect(items.map((o) => o.fit?.verdict)).toEqual(["qualified", "stretch"]);
  });
  it("never throws and leaves items unlabeled when all providers fail", async () => {
    const items = [mk("a")];
    await assessFit(items, cfg, { groqKey: "g" }, async () => { throw new Error("down"); }, async () => { throw new Error("no list"); });
    expect(items[0].fit).toBeUndefined();
    expect(applyFitMode(items, "strict")).toHaveLength(1);
  });
  it("picks a served model and survives retired ones", () => {
    expect(pickModel(["a", "b"], ["x", "b"])).toBe("b");
    expect(pickModel(["google/gemma-4-31b-it:free"], ["meta/old:free"], [/gemma.*:free$/])).toBe("google/gemma-4-31b-it:free");
    expect(pickModel([], ["x", "y"])).toBe("x");
  });
  it("waits out a stated rate limit once, then moves on", async () => {
    expect(retryAfterMs("HTTP 429 ... Please try again in 4.2s. Need 900")).toBe(4700);
    expect(retryAfterMs("HTTP 429 try again in 350ms")).toBe(850);
    const real = 'HTTP 429 {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7170, Requested 1500. Please try again in 5.1s. Need more tokens?"}}';
    expect(real.length).toBeGreaterThan(200); // the hint sits past 200 chars, so error bodies must keep more than that
    expect(retryAfterMs(real)).toBe(5600);
    expect(retryAfterMs("HTTP 429 retry shortly")).toBeNull();
    expect(retryAfterMs("try again in 10m")).toBe(25_000);
    const chain = [{ name: "groq", url: "u", key: "k", model: "openai/gpt-oss-120b" }];
    const waits: number[] = [];
    let calls = 0;
    const send = async (_u: string, _k: string, body: unknown) => {
      calls++;
      expect((body as { reasoning_effort?: string }).reasoning_effort).toBe("low");
      if (calls === 1) throw new Error("HTTP 429 Please try again in 2s.");
      return "ok";
    };
    expect(await complete(chain, [], send, false, async (ms) => { waits.push(ms); })).toBe("ok");
    expect(waits).toEqual([2500]);
    const always = async () => { throw new Error("HTTP 429 Please try again in 1s."); };
    expect(await complete(chain, [], always, false, async () => {})).toBeNull();
  });
  it("modes filter by verdict", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    a.fit = { verdict: "qualified", reason: "" }; b.fit = { verdict: "stretch", reason: "" }; c.fit = { verdict: "not_a_fit", reason: "" };
    expect(applyFitMode([a, b, c], "label")).toHaveLength(3);
    expect(applyFitMode([a, b, c], "hide").map((o) => o.id)).toEqual(["a", "b"]);
    expect(applyFitMode([a, b, c], "strict").map((o) => o.id)).toEqual(["a"]);
  });
});

import { nigeriaFriendly, normSkill } from "../src/helpers.js";
describe("Nigeria tag and Stellar", () => {
  it("flags Nigeria/Africa/WAT but not worldwide, South Africa or exclusions", () => {
    expect(nigeriaFriendly("Nigeria", "")).toBe(true);
    expect(nigeriaFriendly("", "Backend Engineer (Africa)")).toBe(true);
    expect(nigeriaFriendly("", "", "Open to candidates in WAT timezone")).toBe(true);
    expect(nigeriaFriendly("Worldwide", "Backend Engineer")).toBe(false);
    expect(nigeriaFriendly("South Africa only", "")).toBe(false);
    expect(nigeriaFriendly("", "", "not open to candidates outside Nigeria")).toBe(false);
  });
  it("treats Soroban as Stellar", () => { expect(normSkill("soroban")).toBe("stellar"); });
});

import { residencyBlock } from "../src/helpers.js";
describe("full-description filtering", () => {
  const cfg = loadConfig();
  const now = new Date("2026-10-08T00:00:00Z");
  const job = (over: Partial<RawOpp>): RawOpp => ({
    id: "j1", title: "Backend Engineer @ Acme", type: "job", source: "S", url: "https://x.co/j", amountUsd: null, prizeLabel: "n/a",
    deadline: null, location: "remote", region: "", skills: ["nestjs"], snippet: "We build payments.", effort: "medium", postedAt: null, ...over,
  });
  it("drops a job whose years requirement is only in the full text", () => {
    expect(keep(job({}), cfg, new Set(), now)).toBe(true);
    expect(keep(job({ detail: "We build payments. You have 9+ years of experience with distributed systems." }), cfg, new Set(), now)).toBe(false);
  });
  it("drops residency-locked jobs but not ones that welcome Africa/worldwide", () => {
    expect(residencyBlock("Candidates must be based in the US.")).toBeTruthy();
    expect(residencyBlock("You must be authorized to work in the United States")).toBeTruthy();
    expect(residencyBlock("US-based candidates only, but we also welcome Africa")).toBeNull();
    expect(residencyBlock("We hire worldwide. Our HQ is in the US.")).toBeNull();
    expect(keep(job({ detail: "Applicants must be located in the United States." }), cfg, new Set(), now)).toBe(false);
  });
  it("does not store detail in history", () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oe-"));
    const o = { ...opp("d", null, now, "job"), detail: "long text" };
    saveSent([o], now);
    expect(readFileSync(join(process.env.DATA_DIR, "history.jsonl"), "utf8")).not.toContain("long text");
  });
});

import { draftPitch, pitchMessages } from "../src/pitch.js";
import { saveLastDigest, readLastDigest } from "../src/store.js";
describe("pitch and letter", () => {
  const cfg = loadConfig();
  const now = new Date("2026-10-08T00:00:00Z");
  const job = { ...opp("p1", null, now, "job"), title: "Backend Engineer @ PayCo", detail: "NestJS, PostgreSQL, payments. Remote Africa." };
  it("numbers items across sections", () => {
    const items = [job, { ...opp("b1", 100, now, "bounty") }, { ...opp("b2", 100, now, "bounty") }];
    const text = formatTelegram(items, [], now);
    expect(text).toContain("1️⃣ ");
    expect(text).toContain("2️⃣ ");
    expect(text).toContain("3️⃣ ");
  });
  it("round-trips the latest digest without losing order or detail", () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oe-"));
    saveLastDigest([job, opp("b1", 100, now, "bounty")]);
    const d = readLastDigest();
    expect(d.map((x) => x.id)).toEqual(["p1", "b1"]);
    expect(d[0].detail).toContain("NestJS");
  });
  it("grounds the prompt in the profile and forbids invention", () => {
    const [sys, usr] = pitchMessages(readLastDigest()[0], "letter", cfg);
    expect(sys.content).toContain("Solara Pay");
    expect(sys.content).toMatch(/Never invent/);
    expect(sys.content).toContain("Victor Shallangwa");
    expect(usr.content).toContain("PayCo");
  });
  it("falls back across providers and returns null when all fail", async () => {
    const d = readLastDigest()[0];
    const ok = await draftPitch(d, "pitch", cfg, { groqKey: "g", openrouterKey: "o" }, async (url) => { if (url.includes("groq")) throw new Error("429"); return "Lead with: Solara Pay"; }, async () => []);
    expect(ok).toContain("Solara Pay");
    const none = await draftPitch(d, "pitch", cfg, { groqKey: "g" }, async () => { throw new Error("down"); }, async () => []);
    expect(none).toBeNull();
  });
});

import { calendarUrl } from "../src/delivery/format.js";
describe("calendar link", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  it("builds a 30-minute Google Calendar block ending at the deadline", () => {
    const u = new URL(calendarUrl("Arkiv & Friends: Hack", new Date("2026-10-18T22:59:00Z"), "https://x.co/a?b=1&c=2"));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261018T222900Z/20261018T225900Z");
    expect(u.searchParams.get("text")).toBe("⏰ Deadline: Arkiv & Friends: Hack");
    expect(u.searchParams.get("details")).toBe("Apply: https://x.co/a?b=1&c=2");
  });
  it("shows the link only on cards that have a deadline, with & escaped for Telegram HTML", () => {
    const withD = formatTelegram([opp("a", 100, now, "hackathon")], [], now);
    expect(withD).toContain("Add deadline to calendar");
    expect(withD).toContain("action=TEMPLATE&amp;text=");
    expect(withD).not.toMatch(/href="[^"]*&(?!amp;)/);
    const noD = formatTelegram([opp("b", null, now, "job")], [], now);
    expect(noD).not.toContain("calendar");
  });
});

import { findEmail } from "../src/helpers.js";
import { applyPreview, applySend, applyCancel, routeApplyCommand, markApplied, setStatus, statsText, type ApplyDeps } from "../src/apply.js";
import { readApps, readPending, writeApps, funnel } from "../src/applications.js";

describe("email applications", () => {
  const cfg = loadConfig();
  const now = new Date("2026-10-17T12:00:00Z");
  const base = { ...opp("hn1", null, now, "job"), title: "Backend Engineer @ PayCo", source: "HN Who's Hiring", detail: "NestJS payments. Send CV to jobs@payco.io", snippet: "NestJS payments" };
  const setup = () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oe-"));
    saveLastDigest([base, { ...base, id: "hn2", title: "Designer @ NoMail", detail: "no address here", snippet: "x" }, { ...opp("b1", 100, now, "bounty") }]);
  };
  const sent: { to: string; subject: string; text: string; bytes: number }[] = [];
  const deps = (over: Partial<ApplyDeps> = {}): ApplyDeps => ({
    cfg, keys: {}, now, gmail: { user: "me@gmail.com", pass: "pw" },
    draft: async () => "Hi,\n\nI'm applying for the Backend Engineer role.\n\nVictor Shallangwa",
    mail: async (a) => { sent.push({ to: a.to, subject: a.subject, text: a.text, bytes: a.attachment?.content.length ?? 0 }); },
    fetchResume: async () => Buffer.from("%PDF-1.4 fake"),
    repoPublic: async () => false,
    ...over,
  });

  it("finds a usable contact email and skips noreply/image/asset addresses", () => {
    expect(findEmail("Send CV to Jobs@PayCo.io.")).toBe("jobs@payco.io");
    expect(findEmail("noreply@x.com or hello@x.com")).toBe("hello@x.com");
    expect(findEmail("logo@2x.png and nothing else")).toBeNull();
    expect(findEmail("no address")).toBeNull();
  });
  it("stores the contact email on the latest digest and shows the card hint", () => {
    setup();
    expect(readLastDigest()[0].contactEmail).toBe("jobs@payco.io");
    expect(readLastDigest()[1].contactEmail).toBeUndefined();
    const card = formatTelegram([base], [], now);
    expect(card).toContain("/apply 1");
    expect(formatTelegram([{ ...base, detail: "", snippet: "none" }], [], now)).not.toContain("/apply");
  });
  it("previews without sending, then sends exactly the previewed text and logs it", async () => {
    setup(); sent.length = 0;
    const preview = await applyPreview(1, deps());
    expect(preview).toContain("not sent");
    expect(preview).toContain("jobs@payco.io");
    expect(sent).toHaveLength(0);
    const [p] = readPending();
    expect(p.subject).toBe("Application: Backend Engineer - Victor Shallangwa");
    const out = await applySend(p.code, deps());
    expect(out).toContain("Sent");
    expect(sent).toEqual([{ to: "jobs@payco.io", subject: p.subject, text: p.body, bytes: 13 }]);
    expect(readPending()).toHaveLength(0);
    expect(readApps()).toMatchObject([{ id: "A1", status: "sent", via: "email", to: "jobs@payco.io" }]);
  });
  it("refuses duplicates, listings without email, non-jobs, and unknown numbers", async () => {
    setup(); sent.length = 0;
    const [p0] = (await applyPreview(1, deps()), readPending());
    await applySend(p0.code, deps());
    expect(await applyPreview(1, deps())).toContain("Already applied");
    expect(await applyPreview(2, deps())).toContain("no email address");
    expect(await applyPreview(3, deps())).toContain("bounty");
    expect(await applyPreview(9, deps())).toContain("No item #9");
  });
  it("enforces the daily cap, the draft expiry and missing Gmail config", async () => {
    setup(); sent.length = 0;
    await applyPreview(1, deps());
    const [p] = readPending();
    const noSender = await applySend(p.code, deps({ mail: null }));
    expect(noSender).toContain("No automatic sender");
    expect(noSender).toContain("mail.google.com/mail/?view=cm");
    expect(readPending()).toHaveLength(1); // still pending, nothing sent
    expect(await applySend(p.code, deps({ now: new Date(now.getTime() + 49 * 3_600_000) }))).toContain("expired");
    await applyPreview(1, deps());
    const [p2] = readPending();
    writeApps(Array.from({ length: cfg.apply.dailyCap }, (_, i) => ({ id: `A${i + 1}`, itemId: `x${i}`, title: "t", source: "s", type: "job" as const, url: "u", via: "email" as const, to: `a@c${i}.io`, status: "sent" as const, at: now.toISOString(), updated: now.toISOString() })));
    expect(await applySend(p2.code, deps())).toContain("Daily cap");
    expect(sent).toHaveLength(0);
  });
  it("refuses to draft or send while the repo is public, but allows private or unknown", async () => {
    setup(); sent.length = 0;
    expect(await applyPreview(1, deps({ repoPublic: async () => true }))).toContain("repo is public");
    expect(readPending()).toHaveLength(0);
    await applyPreview(1, deps());
    const [p] = readPending();
    expect(await applySend(p.code, deps({ repoPublic: async () => true }))).toContain("repo is public");
    expect(sent).toHaveLength(0);
    expect(await applySend(p.code, deps({ repoPublic: async () => null }))).toContain("Sent");
  });
  it("keeps the draft pending when sending or fetching the resume fails", async () => {
    setup();
    await applyPreview(1, deps());
    const [p] = readPending();
    expect(await applySend(p.code, deps({ mail: async () => { throw new Error("smtp down"); } }))).toContain("Sending failed");
    expect(await applySend(p.code, deps({ fetchResume: async () => { throw new Error("404"); } }))).toContain("Nothing was sent");
    expect(readPending()).toHaveLength(1);
    expect(readApps()).toHaveLength(0);
    expect(applyCancel(p.code)).toContain("Discarded");
    expect(readPending()).toHaveLength(0);
  });
  it("tracks manual applications and statuses, and computes the funnel", async () => {
    setup();
    expect(markApplied(1, now)).toContain("A1");
    expect(markApplied(1, now)).toContain("Already logged");
    expect(setStatus("interview", "a1", now)).toContain("interview");
    expect(setStatus("rejected", "A9", now)).toContain("No application");
    const f = funnel(readApps());
    expect(f).toMatchObject({ total: 1, interviews: 1, responded: 1, interviewRate: "100%" });
    expect(statsText()).toContain("Interviews");
  });
  it("routes only application commands", async () => {
    setup();
    expect(await routeApplyCommand("/mute foo", deps())).toBeNull();
    expect(await routeApplyCommand("/pitch 1", deps())).toBeNull();
    expect(await routeApplyCommand("/apply x", deps())).toContain("Usage");
    expect(await routeApplyCommand("/send", deps())).toContain("Usage");
    expect(await routeApplyCommand("/apps", deps())).toContain("No applications");
  });
});


import { gmailApiMailer, accessToken, buildRaw, composeUrl, authUrl, GMAIL_SEND_SCOPE } from "../src/delivery/gmailapi.js";
import { composeLink, applyMarkSent, resolveMailer } from "../src/apply.js";
describe("senders: Gmail API and compose link", () => {
  const creds = { clientId: "cid", clientSecret: "sec", refreshToken: "rt" };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("requests a token with the refresh token, then sends a base64url RFC822 message with the resume attached", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return String(url).includes("oauth2") ? json(200, { access_token: "AT" }) : json(200, { id: "m1" });
    }) as unknown as typeof fetch;
    await gmailApiMailer(creds, "me@gmail.com", f)({
      fromName: "Victor Shallangwa", to: "jobs@payco.io", subject: "Application: Backend Engineer", text: "Hi,\n\nHello there.",
      attachment: { filename: "Resume.pdf", content: Buffer.from("%PDF-1.4 fake") },
    });
    expect(calls).toHaveLength(2);
    const tok = new URLSearchParams(String(calls[0].init.body));
    expect(Object.fromEntries(tok)).toMatchObject({ client_id: "cid", client_secret: "sec", refresh_token: "rt", grant_type: "refresh_token" });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer AT");
    const raw = Buffer.from(JSON.parse(String(calls[1].init.body)).raw, "base64url").toString();
    expect(raw).toContain("To: jobs@payco.io");
    expect(raw).toContain("Subject: Application: Backend Engineer");
    expect(raw).toContain("Victor Shallangwa");
    expect(raw).toMatch(/Content-Disposition: attachment; filename="?Resume\.pdf"?/);
    expect(raw).toContain("application/pdf");
  });
  it("explains an expired or revoked token and surfaces API errors", async () => {
    const bad = (async () => json(400, { error: "invalid_grant" })) as unknown as typeof fetch;
    await expect(accessToken(creds, bad)).rejects.toThrow(/gmail-auth/);
    const sendFails = (async (url: string) => (String(url).includes("oauth2") ? json(200, { access_token: "AT" }) : new Response("quota", { status: 403 }))) as unknown as typeof fetch;
    await expect(gmailApiMailer(creds, "me@gmail.com", sendFails)({ to: "a@b.co", subject: "s", text: "t" })).rejects.toThrow(/Gmail API 403/);
  });
  it("asks only for the send scope", () => {
    const u = new URL(authUrl("cid", "http://127.0.0.1:53682/callback", "st"));
    expect(u.searchParams.get("scope")).toBe(GMAIL_SEND_SCOPE);
    expect(GMAIL_SEND_SCOPE).toBe("https://www.googleapis.com/auth/gmail.send");
    expect(u.searchParams.get("access_type")).toBe("offline");
  });
  it("builds a Gmail compose link with the resume as a link line, and keeps it short enough", () => {
    const u = new URL(composeUrl("jobs@payco.io", "Application: X", "Hi,\nthere"));
    expect(u.searchParams.get("to")).toBe("jobs@payco.io");
    expect(u.searchParams.get("body")).toBe("Hi,\nthere");
    const link = new URL(composeLink({ to: "jobs@payco.io", subject: "S", body: "Hi,\nthere" }, "https://donvicks.dev/r.pdf"));
    expect(link.searchParams.get("body")).toContain("Resume: https://donvicks.dev/r.pdf");
    const long = composeLink({ to: "a@b.co", subject: "S", body: "word ".repeat(1000) }, "https://x.co/r.pdf");
    expect(long.length).toBeLessThanOrEqual(2200);
  });
  it("shows the compose link when no sender is configured, and /sent logs a manual send", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "oe-"));
    const now = new Date("2026-10-17T12:00:00Z");
    const job = { ...opp("hn1", null, now, "job"), title: "Backend Engineer @ PayCo", detail: "Send CV to jobs@payco.io", snippet: "x" };
    saveLastDigest([job]);
    const d: ApplyDeps = { cfg: loadConfig(), keys: {}, now, mail: null, draft: async () => "Hi,\n\nBody.\n\nVictor", repoPublic: async () => false };
    const preview = await applyPreview(1, d);
    expect(preview).toContain("No automatic sender");
    expect(preview).toContain("Open in Gmail");
    expect(preview).toContain("/sent ");
    const [p] = readPending();
    expect(applyMarkSent(p.code, d)).toContain("A1");
    expect(readApps()).toMatchObject([{ id: "A1", status: "sent", to: "jobs@payco.io" }]);
    expect(readPending()).toHaveLength(0);
    expect(applyMarkSent("zzzz", d)).toContain("No pending");
  });
  it("prefers an injected sender, and falls back to none without credentials", () => {
    const cfg = loadConfig();
    const stub = async () => {};
    expect(resolveMailer({ cfg, keys: {}, mail: stub })).toBe(stub);
    expect(resolveMailer({ cfg, keys: {}, mail: null })).toBeNull();
    expect(resolveMailer({ cfg, keys: {}, gmail: {} })).toBeNull();
    expect(resolveMailer({ cfg, keys: {}, gmail: { user: "u@gmail.com", pass: "pw" } })).toBeTypeOf("function");
  });
});
