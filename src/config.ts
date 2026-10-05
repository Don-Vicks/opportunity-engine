import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const Effort = z.enum(["low", "medium", "high"]);
const ConfigSchema = z.object({
  profile: z.object({
    skills: z.array(z.string()).min(1),
    preferredTypes: z.array(z.string()),
    remoteOnly: z.boolean(),
    availableEffort: Effort,
    deadlineWindowDays: z.number().positive(),
    minPrizeUsd: z.record(z.number()),
  }),
  digest: z.object({
    maxResults: z.number().int().positive(),
    minScore: z.number().min(0).max(1),
    frequencyDays: z.number().int().positive(),
  }),
  sources: z.record(z.boolean()),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path = "config.yaml"): Config {
  return ConfigSchema.parse(parse(readFileSync(path, "utf8")));
}

export const env = {
  tgToken: process.env.TELEGRAM_BOT_TOKEN,
  tgChat: process.env.TELEGRAM_CHAT_ID,
  gmailUser: process.env.GMAIL_USER,
  gmailPass: process.env.GMAIL_APP_PASSWORD,
  emailTo: process.env.EMAIL_TO,
};
