import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
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
