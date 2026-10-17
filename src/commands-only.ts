import { loadConfig, env } from "./config.js";
import { pollCommands } from "./telegram-commands.js";

/** Lightweight run: read Telegram commands (/apply, /send, /pitch, ...) without fetching any job sources. */
async function main() {
  if (!env.tgToken || !env.tgChat) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  const cfg = loadConfig();
  await pollCommands(env.tgToken, env.tgChat, { cfg, keys: { groqKey: env.groqKey, openrouterKey: env.openrouterKey } });
  console.log("commands processed");
}
main().catch((e) => { console.error(e); process.exit(1); });
