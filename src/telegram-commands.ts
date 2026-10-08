import { applyCommand } from "./prefs.js";
import { draftPitch, type PitchKind } from "./pitch.js";
import type { Config } from "./config.js";
import type { Providers } from "./fit.js";
import { readLastDigest, readPrefs, writePrefs, readState, writeState, type Prefs } from "./store.js";
import { esc } from "./delivery/format.js";
import { sendTelegram } from "./delivery/telegram.js";

interface Update { update_id: number; message?: { text?: string; chat?: { id: number } } }

/** Reads new messages sent to the bot, applies /mute /boost commands from the owner only, confirms in chat. */
export async function pollCommands(token: string, chatId: string, ai?: { cfg: Config; keys: Providers }): Promise<Prefs> {
  let prefs = readPrefs();
  const offset = readState().tgOffset;
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?timeout=0&allowed_updates=${encodeURIComponent('["message"]')}${offset ? `&offset=${offset}` : ""}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) return prefs;
  const { result = [] } = (await res.json()) as { result?: Update[] };
  let last = offset ?? 0;
  const replies: string[] = [];
  for (const u of result) {
    last = Math.max(last, u.update_id + 1);
    if (String(u.message?.chat?.id) !== chatId || !u.message?.text) continue; // owner only
    const pitch = u.message.text.trim().match(/^\/(pitch|letter)(?:@\w+)?\s+(\d+)\b/i);
    if (pitch) { replies.push(await pitchReply(pitch[1].toLowerCase() as PitchKind, Number(pitch[2]), ai)); continue; }
    const out = applyCommand(u.message.text, prefs);
    if (out) { prefs = out.prefs; replies.push(esc(out.reply)); }
  }
  if (result.length) writeState({ tgOffset: last });
  writePrefs(prefs);
  if (replies.length) await sendTelegram(token, chatId, replies.join("\n\n"));
  return prefs;
}

/** Answers "/pitch N" or "/letter N" for item N of the latest digest. Never throws. */
export async function pitchReply(kind: PitchKind, n: number, ai?: { cfg: Config; keys: Providers }): Promise<string> {
  const item = readLastDigest()[n - 1];
  if (!item) return esc(`No item #${n} in the latest digest.`);
  if (!ai) return esc("AI isn't configured (set GROQ_API_KEY or OPENROUTER_API_KEY).");
  const text = await draftPitch(item, kind, ai.cfg, ai.keys).catch(() => null);
  if (!text) return esc(`Couldn't draft #${n} right now (AI providers unavailable). Try again next run.`);
  return `<b>${kind === "letter" ? "✉️ Cover letter" : "🎯 Pitch"} — ${esc(item.title)}</b>\n\n${esc(text.trim())}\n\n🔗 ${esc(item.applyUrl ?? item.url)}`;
}
