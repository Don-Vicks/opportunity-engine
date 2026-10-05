import type { Prefs } from "./store.js";

const norm = (w: string) => w.trim().toLowerCase();
export const hasWord = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
};

export interface CommandResult { prefs: Prefs; reply: string }

/** Pure handler for Telegram commands: /mute /unmute /boost /unboost /prefs /help */
export function applyCommand(text: string, prefs: Prefs): CommandResult | null {
  const m = text.trim().match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const word = norm(m[2]);
  const p: Prefs = { mute: [...prefs.mute], boost: [...prefs.boost] };
  const add = (k: keyof Prefs) => { if (!p[k].includes(word)) p[k].push(word); };
  const del = (k: keyof Prefs) => { p[k] = p[k].filter((x) => x !== word); };
  switch (cmd) {
    case "mute": if (!word) return { prefs, reply: "Usage: /mute <word>  (hides titles containing it)" }; add("mute"); return { prefs: p, reply: `🔇 Muted “${word}”. Titles containing it won't be sent.` };
    case "unmute": del("mute"); return { prefs: p, reply: `🔔 Unmuted “${word}”.` };
    case "boost": if (!word) return { prefs: prefs, reply: "Usage: /boost <word>  (ranks matches higher)" }; add("boost"); return { prefs: p, reply: `⭐ Boosting “${word}”. Matches rank higher.` };
    case "unboost": del("boost"); return { prefs: p, reply: `Removed boost “${word}”.` };
    case "prefs": return { prefs, reply: `🔇 Muted: ${prefs.mute.join(", ") || "—"}\n⭐ Boosted: ${prefs.boost.join(", ") || "—"}` };
    case "help": case "start": return { prefs, reply: "Commands:\n/mute <word> — hide titles with it\n/unmute <word>\n/boost <word> — rank higher\n/unboost <word>\n/prefs — show lists\nChanges apply on the next run (≤3h)." };
    default: return null;
  }
}
