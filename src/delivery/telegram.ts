/** Sends HTML-formatted text (caller must escape). Splits on blank lines to stay under 4096 chars. */
export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    throw new Error(
      `TELEGRAM_BOT_TOKEN looks malformed (length ${token.length}, expected like 123456789:AA... with no spaces). Re-set the secret.`,
    );
  }
  const chunks: string[] = [];
  let cur = "";
  for (const block of text.split("\n\n")) {
    if ((cur + "\n\n" + block).length > 3900 && cur) { chunks.push(cur); cur = block; }
    else cur = cur ? `${cur}\n\n${block}` : block;
  }
  if (cur) chunks.push(cur);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const hint = res.status === 404 || res.status === 401 ? " (bot token invalid or revoked — check the TELEGRAM_BOT_TOKEN secret)"
        : res.status === 400 ? " (check TELEGRAM_CHAT_ID, and that you sent the bot /start)" : "";
      throw new Error(`Telegram ${res.status}: ${(await res.text()).replace(token, "***")}${hint}`);
    }
  }
}
