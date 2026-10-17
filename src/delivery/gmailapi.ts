import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { MailFn } from "./email.js";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GoogleCreds { clientId: string; clientSecret: string; refreshToken: string }
type Fetch = typeof fetch;

/** Exchanges the long-lived refresh token for a short-lived access token. */
export async function accessToken(c: GoogleCreds, f: Fetch = fetch): Promise<string> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    const hint = j.error === "invalid_grant"
      ? " (the Google token expired or was revoked: re-run `npm run gmail-auth` and update GOOGLE_REFRESH_TOKEN; tokens of apps left in \"Testing\" expire after 7 days)"
      : "";
    throw new Error(`Google token request failed: ${j.error ?? res.status}${hint}`);
  }
  return j.access_token;
}

/** Builds the RFC 822 message (attachment included) and base64url-encodes it for the Gmail API. */
export async function buildRaw(from: string, m: Parameters<MailFn>[0]): Promise<string> {
  const msg = new MailComposer({
    from: m.fromName ? { name: m.fromName, address: from } : from,
    to: m.to, subject: m.subject, text: m.text,
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    ...(m.attachment ? { attachments: [{ filename: m.attachment.filename, content: m.attachment.content, contentType: "application/pdf" }] } : {}),
  }).compile();
  const buf: Buffer = await new Promise((resolve, reject) => msg.build((e, b) => (e ? reject(e) : resolve(b))));
  return buf.toString("base64url");
}

/**
 * Sender 2 (recommended): Gmail API with the send-only scope. The token cannot read, search or delete mail,
 * and can be revoked at myaccount.google.com/permissions.
 */
export const gmailApiMailer = (c: GoogleCreds, from: string, f: Fetch = fetch): MailFn => async (m) => {
  const token = await accessToken(c, f);
  const res = await f(SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: await buildRaw(from, m) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 300)}`);
};

/** One-click Gmail compose window with recipient, subject and body prefilled (no attachments possible). */
export function composeUrl(to: string, subject: string, body: string): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q}`;
}

/** URL the user opens once to approve send-only access (loopback redirect, used by scripts/gmail-auth.ts). */
export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: GMAIL_SEND_SCOPE,
    access_type: "offline", prompt: "consent", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
