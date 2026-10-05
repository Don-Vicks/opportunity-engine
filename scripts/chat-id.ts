// Usage: TELEGRAM_BOT_TOKEN=... npm run chat-id   (message your bot first)
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error("Set TELEGRAM_BOT_TOKEN first."); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = (await res.json()) as { ok: boolean; description?: string; result: any[] };
if (!body.ok) { console.error(`Telegram error: ${body.description}`); process.exit(1); }

const chats = new Map<number, string>();
for (const u of body.result) {
  const c = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
  if (c) chats.set(c.id, c.username ? `@${c.username}` : c.first_name ?? c.title ?? "");
}
if (!chats.size) console.log("No messages found. Send your bot a message (e.g. /start) and run again.");
for (const [id, name] of chats) console.log(`TELEGRAM_CHAT_ID=${id}   (${name})`);
