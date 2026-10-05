import nodemailer from "nodemailer";

export async function sendEmail(user: string, pass: string, to: string, subject: string, text: string) {
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await t.sendMail({ from: user, to, subject, text });
}
