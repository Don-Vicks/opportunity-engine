import type { Config } from "./config.js";

type Exp = Config["profile"]["experience"];

/** Titles above any individual-contributor path we want to see. */
const TOO_SENIOR = /\b(staff|principal|distinguished|fellow|head of|director|vp|vice president|chief|cto|architect|engineering manager|team lead|tech lead|technical lead|lead (?:\w+ ){0,2}(?:engineer|developer))\b/i;
const SENIOR = /\b(senior|sr\.?)\b/i;
const YEARS = /(\d{1,2})\s*(?:\+|\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)(?:['’]s)?\s+(?:of\s+)?(?:[\w/.-]+\s+){0,4}?(?:experience|exp)\b|experience[:\s]+(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i;

/** Lowest "N years of experience" figure found in the text, or null. */
export function yearsRequired(text: string): number | null {
  const m = text.match(YEARS);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Why a job/freelance listing is above the candidate's level, or null if it is fine. */
export function overLevel(title: string, text: string, exp: Exp): string | null {
  if (TOO_SENIOR.test(title)) return "title too senior";
  if (!exp.allowSenior && SENIOR.test(title)) return "senior title";
  const y = yearsRequired(`${title}. ${text}`);
  if (y != null && y > exp.maxYearsRequired) return `asks ${y}+ years`;
  return null;
}
