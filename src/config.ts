import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const Effort = z.enum(["low", "medium", "high"]);
const ConfigSchema = z.object({
  profile: z.object({
    roleSkills: z.array(z.string()).min(1),
    skills: z.array(z.string()).min(1),
    preferredTypes: z.array(z.string()),
    remoteOnly: z.boolean(),
    regionFilter: z.boolean().default(true),
    availableEffort: Effort,
    deadlineWindowDays: z.number().positive(),
    minPrizeUsd: z.record(z.number()),
    excludeKeywords: z.array(z.string()).default([]),
    /** Skills that get a ranking boost (your strongest area) */
    focusSkills: z.array(z.string()).default([]),
    experience: z.object({
      years: z.number().nonnegative(),
      allowSenior: z.boolean().default(true),
      /** Jobs asking for more years than this are dropped (your years + tolerance) */
      maxYearsRequired: z.number().positive(),
    }).default({ years: 4, allowSenior: true, maxYearsRequired: 5 }),
    portfolio: z.object({
      name: z.string().default(""),
      site: z.string().default(""),
      summary: z.string().default(""),
      strongest: z.string().default(""),
      projects: z.array(z.string()).default([]),
      achievements: z.array(z.string()).default([]),
    }).default({}),
  }),
  apply: z.object({
    /** Public PDF fetched at send time and attached to email applications (never committed) */
    resumeUrl: z.string().default(""),
    /** Max email applications per rolling 24h */
    dailyCap: z.number().int().positive().default(5),
    fromName: z.string().default(""),
    /** Optional Reply-To; replies go to the Gmail sender if empty */
    replyTo: z.string().default(""),
    /** Refuse /apply and /send while the GitHub repo is public (drafts and the tracker are committed to it) */
    requirePrivateRepo: z.boolean().default(true),
  }).default({}),
  ai: z.object({
    enabled: z.boolean().default(false),
    /** label = tag only, hide = drop "not a fit", strict = keep only "qualified" */
    mode: z.enum(["label", "hide", "strict"]).default("label"),
    groqModel: z.string().default("openai/gpt-oss-120b"),
    openrouterModel: z.string().default("google/gemma-4-31b-it:free"),
  }).default({}),
  digest: z.object({
    maxResults: z.number().int().positive(),
    minScore: z.number().min(0).max(1),
    sendWhenEmpty: z.boolean(),
    maxPerType: z.record(z.number()),
  }),
  sources: z.record(z.boolean()),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path = "config.yaml"): Config {
  return ConfigSchema.parse(parse(readFileSync(path, "utf8")));
}

/** Secrets pasted into UIs often carry whitespace, quotes or a "bot" prefix. */
const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "").replace(/^bot(?=\d)/i, "").trim() || undefined;

export const env = {
  tgToken: clean(process.env.TELEGRAM_BOT_TOKEN),
  tgChat: clean(process.env.TELEGRAM_CHAT_ID),
  groqKey: clean(process.env.GROQ_API_KEY),
  openrouterKey: clean(process.env.OPENROUTER_API_KEY),
  googleClientId: clean(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: clean(process.env.GOOGLE_CLIENT_SECRET),
  googleRefreshToken: clean(process.env.GOOGLE_REFRESH_TOKEN),
  gmailUser: process.env.GMAIL_USER,
  gmailPass: process.env.GMAIL_APP_PASSWORD,
  emailTo: process.env.EMAIL_TO,
};
