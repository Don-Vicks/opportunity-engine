export type OppType = "hackathon" | "job" | "freelance" | "bounty" | "grant" | "other";
export type Effort = "low" | "medium" | "high";

export interface Opportunity {
  id: string;
  title: string;
  type: OppType;
  source: string;
  url: string;
  /** Normalised to USD where known; jobs are yearly. null = unknown */
  amountUsd: number | null;
  prizeLabel: string;
  deadline: Date | null;
  location: string;
  skills: string[];
  snippet: string;
  effort: Effort | null;
  postedAt: Date | null;
  score: number;
  foundAt: Date;
}

export type RawOpp = Omit<Opportunity, "score" | "foundAt">;

export interface Source {
  name: string;
  fetch(): Promise<RawOpp[]>;
}
