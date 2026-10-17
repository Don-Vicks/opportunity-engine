// One-time setup: approve send-only Gmail access and print a refresh token.
// Usage: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run gmail-auth
// Run it on your own computer (it opens a local callback on http://127.0.0.1:53682).
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { authUrl } from "../src/delivery/gmailapi.js";

const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) { console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (OAuth client of type 'Desktop app')."); process.exit(1); }

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;
const state = randomBytes(16).toString("hex");

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", redirect);
  if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
  if (u.searchParams.get("state") !== state || !u.searchParams.get("code")) { res.writeHead(400).end("Bad request"); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: u.searchParams.get("code")!, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { refresh_token?: string; error?: string };
  res.writeHead(200, { "Content-Type": "text/plain" }).end(j.refresh_token ? "Done. You can close this tab and return to the terminal." : `Failed: ${j.error ?? r.status}`);
  if (j.refresh_token) {
    console.log("\nSave this as the GitHub secret GOOGLE_REFRESH_TOKEN (and never commit it):\n");
    console.log(j.refresh_token + "\n");
  } else console.error("No refresh token returned:", j.error ?? r.status, "(revoke the app at myaccount.google.com/permissions and retry)");
  server.close();
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL, sign in, and approve 'Send email on your behalf':\n\n" + authUrl(id, redirect, state) + "\n");
});
