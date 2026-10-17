import nodemailer from "nodemailer";

export async function sendEmail(user: string, pass: string, to: string, subject: string, text: string) {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await t.sendMail({ from: user, to, subject, text });
}

export interface Application {
  user: string; pass: string; fromName?: string; replyTo?: string;
  to: string; subject: string; text: string;
  attachment?: { filename: string; content: Buffer };
}
export type MailFn = (a: Application) => Promise<void>;

/** Sends one application from the user's own Gmail (app password), resume attached. */
export const sendApplication: MailFn = async (a) => {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: a.user, pass: a.pass } });
  await t.sendMail({
    from: a.fromName ? { name: a.fromName, address: a.user } : a.user,
    to: a.to, subject: a.subject, text: a.text,
    ...(a.replyTo ? { replyTo: a.replyTo } : {}),
    ...(a.attachment ? { attachments: [{ filename: a.attachment.filename, content: a.attachment.content, contentType: "application/pdf" }] } : {}),
  });
};
