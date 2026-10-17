import nodemailer from "nodemailer";

export async function sendEmail(user: string, pass: string, to: string, subject: string, text: string) {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await t.sendMail({ from: user, to, subject, text });
}

/** A message to send; the sender (SMTP app password or Gmail API) is chosen elsewhere. */
export interface OutgoingMail {
  fromName?: string; replyTo?: string;
  to: string; subject: string; text: string;
  attachment?: { filename: string; content: Buffer };
}
export type MailFn = (m: OutgoingMail) => Promise<void>;

/** Sender 1: Gmail SMTP with an app password (can read and send the whole mailbox; prefer the API sender). */
export const smtpMailer = (user: string, pass: string): MailFn => async (m) => {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await t.sendMail({
    from: m.fromName ? { name: m.fromName, address: user } : user,
    to: m.to, subject: m.subject, text: m.text,
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    ...(m.attachment ? { attachments: [{ filename: m.attachment.filename, content: m.attachment.content, contentType: "application/pdf" }] } : {}),
  });
};
