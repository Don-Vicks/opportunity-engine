import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";
import { score, urgencyScore, compScore } from "../src/ranking.js";
import { keep } from "../src/filter.js";
import { parseDevpostEnd, parsePrize } from "../src/sources/devpost.js";
import type { RawOpp } from "../src/schema.js";

const cfg = loadConfig();
const now = new Date("2026-10-05T00:00:00Z");
const base: RawOpp = {
  id: "x:1", title: "t", type: "bounty", source: "x", url: "u", amountUsd: 1000, prizeLabel: "$1000",
  deadline: new Date("2026-10-15T00:00:00Z"), location: "remote", skills: ["rust", "solana"],
  snippet: "", effort: "medium", postedAt: null,
};

describe("ranking", () => {
  it("scores a strong match highly", () => expect(score(base, cfg.profile, now)).toBeGreaterThan(0.7));
  it("zero urgency when expired/imminent", () =>
    expect(urgencyScore({ ...base, deadline: new Date("2026-10-05T10:00:00Z") }, now)).toBe(0));
  it("unknown amount is neutral", () => expect(compScore({ ...base, amountUsd: null }, cfg.profile)).toBe(0.3));
});

describe("filter", () => {
  it("drops seen", () => expect(keep(base, cfg, new Set(["x:1"]), now)).toBe(false));
  it("drops below min", () => expect(keep({ ...base, amountUsd: 10 }, cfg, new Set(), now)).toBe(false));
  it("drops onsite when remoteOnly", () => expect(keep({ ...base, location: "Lagos" }, cfg, new Set(), now)).toBe(false));
  it("drops far deadlines", () =>
    expect(keep({ ...base, deadline: new Date("2027-03-01") }, cfg, new Set(), now)).toBe(false));
  it("keeps a good one", () => expect(keep(base, cfg, new Set(), now)).toBe(true));
});

describe("devpost parsers", () => {
  it("parses end date", () => expect(parseDevpostEnd("Aug 21 - Oct 05, 2026")?.toISOString()).toBe("2026-10-05T23:59:59.000Z"));
  it("handles omitted month", () => expect(parseDevpostEnd("Oct 01 - 10, 2026")?.toISOString()).toBe("2026-10-10T23:59:59.000Z"));
  it("handles cross-year", () => expect(parseDevpostEnd("Dec 20, 2026 - Jan 15, 2027")?.toISOString()).toBe("2027-01-15T23:59:59.000Z"));
  it("parses prize", () => expect(parsePrize("$<span data-currency-value>12,500</span>")).toBe(12500));
  it("zero prize is null", () => expect(parsePrize("$<span data-currency-value>0</span>")).toBeNull());
});
