import { applyCommand } from "./prefs.js";
import { readPrefs, writePrefs, readState, writeState, type Prefs } from "./store.js";
import { esc } from "./delivery/format.js";
import { sendTelegram } from "./delivery/telegram.js";

interface Update { update_id: number; message?: { text?: string; chat?: { id: number } } }

/** Reads new messages sent to the bot, applies /mute /boost commands from the owner only, confirms in chat. */
export async function pollCommands(token: string, chatId: string): Promise<Prefs> {
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
    const out = applyCommand(u.message.text, prefs);
    if (out) { prefs = out.prefs; replies.push(esc(out.reply)); }
  }
  if (result.length) writeState({ tgOffset: last });
  writePrefs(prefs);
  if (replies.length) await sendTelegram(token, chatId, replies.join("\n\n"));
  return prefs;
}
