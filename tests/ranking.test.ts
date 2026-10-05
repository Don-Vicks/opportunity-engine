import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";
import { score, urgencyScore, compScore } from "../src/ranking.js";
import { findApplyUrl, regionOk, parseSalaryUsd, looksClosed, restrictiveRegion, isTechTitle } from "../src/helpers.js";
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
  it("jobs need a role skill", () => {
    const job = { ...base, title: "Senior Developer", type: "job" as const, amountUsd: null, deadline: null, skills: ["python"] };
    expect(keep(job, cfg, new Set(), now)).toBe(false);
    expect(keep({ ...job, skills: ["nestjs"] }, cfg, new Set(), now)).toBe(true);
  });
  it("keeps a good one", () => expect(keep(base, cfg, new Set(), now)).toBe(true));
});

describe("devpost parsers", () => {
  it("parses end date", () => expect(parseDevpostEnd("Aug 21 - Oct 05, 2026")?.toISOString()).toBe("2026-10-05T23:59:59.000Z"));
  it("handles omitted month", () => expect(parseDevpostEnd("Oct 01 - 10, 2026")?.toISOString()).toBe("2026-10-10T23:59:59.000Z"));
  it("handles cross-year", () => expect(parseDevpostEnd("Dec 20, 2026 - Jan 15, 2027")?.toISOString()).toBe("2027-01-15T23:59:59.000Z"));
  it("parses prize", () => expect(parsePrize("$<span data-currency-value>12,500</span>")).toBe(12500));
  it("zero prize is null", () => expect(parsePrize("$<span data-currency-value>0</span>")).toBeNull());
});

describe("region", () => {
  it.each(["", "Remote", "Anywhere", "Worldwide", "Anywhere in the World", "EMEA", "Nigeria", "Africa", "Time zone: CET (+/- 3 hours)"])(
    "allows %j", (r) => expect(regionOk(r)).toBe(true));
  it.each(["USA", "Remote - US", "North America Only", "Europe, LATAM, APAC, the U.S., Canada", "Ireland", "USA, Canada, USA timezones", "Philippines, Guatemala, South Africa"])(
    "blocks %j", (r) => expect(regionOk(r)).toBe(false));
  it("HN header", () => {
    expect(restrictiveRegion("Acme | SWE | REMOTE (US only)")).not.toBe("");
    expect(restrictiveRegion("Acme | SWE | REMOTE worldwide")).toBe("");
  });
});

describe("helpers", () => {
  it("salary", () => { expect(parseSalaryUsd("$20k -$35k")).toBe(35000); expect(parseSalaryUsd("$50/hour")).toBeNull(); });
  it("closed", () => { expect(looksClosed("This position has been filled")).toBe(true); expect(looksClosed("Senior Dev")).toBe(false); });
  it("tech title", () => { expect(isTechTitle("Senior Rust Engineer")).toBe(true); expect(isTechTitle("Account Director")).toBe(false); });
});

describe("findApplyUrl", () => {
  it("finds ATS anchor", () =>
    expect(findApplyUrl('<p>About us</p><a href="https://boards.greenhouse.io/acme/jobs/123?utm_source=x">Apply here</a>', ["remoteok.com"]))
      .toBe("https://boards.greenhouse.io/acme/jobs/123"));
  it("decodes escaped RSS html", () =>
    expect(findApplyUrl("&lt;a href=&quot;https://jobs.lever.co/acme/abc&quot;&gt;Apply now&lt;/a&gt;", [])).toBe("https://jobs.lever.co/acme/abc"));
  it("ignores own site and socials", () =>
    expect(findApplyUrl('<a href="https://remoteok.com/l/1">Apply</a> <a href="https://twitter.com/acme">Apply</a>', ["remoteok.com"])).toBeUndefined());
  it("finds bare url after Apply", () =>
    expect(findApplyUrl("Apply: https://acme.com/careers/rust-engineer", [])).toBe("https://acme.com/careers/rust-engineer"));
});
