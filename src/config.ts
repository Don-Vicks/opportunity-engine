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
    availableEffort: Effort,
    deadlineWindowDays: z.number().positive(),
    minPrizeUsd: z.record(z.number()),
    excludeKeywords: z.array(z.string()).default([]),
  }),
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
  gmailUser: process.env.GMAIL_USER,
  gmailPass: process.env.GMAIL_APP_PASSWORD,
  emailTo: process.env.EMAIL_TO,
};
