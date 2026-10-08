export type OppType = "hackathon" | "job" | "freelance" | "bounty" | "grant" | "other";
export type Effort = "low" | "medium" | "high";

export interface Opportunity {
  id: string;
  title: string;
  type: OppType;
  source: string;
  url: string;
  /** Direct link to the employer/ATS application page when we can find one */
  applyUrl?: string;
  /** Normalised to USD where known; jobs are yearly. null = unknown */
  amountUsd: number | null;
  prizeLabel: string;
  deadline: Date | null;
  location: string;
  /** Free-text region the candidate must be in (e.g. "USA only"); empty/undefined = unrestricted */
  region?: string;
  skills: string[];
  snippet: string;
  effort: Effort | null;
  postedAt: Date | null;
  score: number;
  /** AI verdict on whether the candidate qualifies (optional; absent if AI is off/unavailable) */
  fit?: { verdict: "qualified" | "stretch" | "not_a_fit"; reason: string };
  foundAt: Date;
}

export type RawOpp = Omit<Opportunity, "score" | "foundAt">;

export interface Source {
  name: string;
  fetch(): Promise<RawOpp[]>;
}
