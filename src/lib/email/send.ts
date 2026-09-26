import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { renderTemplate, type TemplateVars } from "@/lib/email/templates";
import { SITE } from "@/lib/site";
import type { CommStatus, CommType } from "@/generated/prisma/enums";

const FROM = process.env.EMAIL_FROM ?? "AGENTX 2026 <no-reply@example.com>";

/**
 * `smtp` sends for real over SMTP; `console` is the no-credentials fallback that
 * logs the rendered email so local development still walks the whole path.
 *
 * SMTP is the only transport because the sender is a consumer mailbox. A hosted
 * API will only send from a domain you have verified, and `gmail.com` can never
 * be one, so any such provider rejects the `from` with a 403 and the message is
 * never delivered. A mail server has no such rule: with a Google app password,
 * Gmail sends from the real account to any recipient.
 */
type Transport = "smtp" | "console";

function transport(): Transport {
  return process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim() ? "smtp" : "console";
}

/** Which transport is active, so admin UI can warn about Gmail's daily cap. */
export function transportName(): Transport {
  return transport();
}

let smtpTransporter: nodemailer.Transporter | null = null;

function smtp(): nodemailer.Transporter {
  smtpTransporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    // 587 is STARTTLS, 465 is implicit TLS. Nodemailer infers this from the
    // port, so only state it when the port is not the 587 default.
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      // A Google app password, never the account password.
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
  });
  return smtpTransporter;
}

export type SendResult = {
  status: CommStatus;
  providerId?: string;
  error?: string;
};

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  if (transport() === "console") {
    if (process.env.NODE_ENV !== "test") {
      console.info(`[email:dev] to=${input.to} subject="${input.subject}"`);
    }
    return { status: "SENT", providerId: `dev-${Date.now()}` };
  }

  try {
    const info = await smtp().sendMail({
      from: FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { status: "SENT", providerId: info.messageId };
  } catch (e) {
    return { status: "FAILED", error: describeSendError(e) };
  }
}

/**
 * Nodemailer surfaces credential problems as a bare `535` or `EAUTH`, which says
 * nothing about what to change. Since an app password is the single most likely
 * cause, name it rather than leaving someone to guess.
 */
function describeSendError(e: unknown): string {
  const message = e instanceof Error ? e.message : "Unknown SMTP send error";
  if (/535|EAUTH|invalid login|authentication failed/i.test(message)) {
    return `${message} — SMTP_PASSWORD is probably wrong. It must be a 16-character Google app password from myaccount.google.com/apppasswords, not the account password.`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo/i.test(message)) {
    return `${message} — could not reach ${process.env.SMTP_HOST || "smtp.gmail.com"}:${process.env.SMTP_PORT || "587"}. Check SMTP_HOST, SMTP_PORT and any firewall or egress rules.`;
  }
  return message;
}

/** Minimal, dependency-free HTML wrapper. Bodies are plain text + \n. */
export function toHtml(body: string, vars?: TemplateVars): string {
  const filled = vars ? renderTemplate(body, vars) : body;
  const escaped = filled
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.65">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#e8ecf1;background:#0a0c10;padding:28px;border:1px solid #202634;border-radius:12px">
  <p style="margin:0 0 18px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#22d3ee">${SITE.name}</p>
  ${paragraphs}
  <hr style="border:none;border-top:1px solid #202634;margin:22px 0">
  <p style="margin:0;font-size:12px;color:#7d8799">Sent by the ${SITE.name} operations platform.</p>
</div>`;
}

export type SendToTeamInput = {
  templateKey: string;
  type: CommType;
  teamId?: string | null;
  to: string;
  recipientName?: string;
  vars: TemplateVars;
  sentById?: string | null;
};

/** Renders a stored template, sends it, and records the outcome. */
export async function sendTemplatedEmail(input: SendToTeamInput): Promise<SendResult> {
  const template = await prisma.emailTemplate.findUnique({ where: { key: input.templateKey } });
  if (!template) {
    const error = `Template "${input.templateKey}" not found.`;
    await logComm({
      ...input,
      subject: input.templateKey,
      body: "",
      status: "FAILED",
      error,
    });
    return { status: "FAILED", error };
  }

  const subject = renderTemplate(template.subject, input.vars);
  const body = renderTemplate(template.body, input.vars);
  const html = toHtml(template.body, input.vars);
  const result = await sendEmail({ to: input.to, subject, html });

  await logComm({
    ...input,
    subject,
    body,
    status: result.status,
    error: result.error,
    providerId: result.providerId,
  });

  return result;
}

async function logComm(
  input: SendToTeamInput & {
    subject: string;
    body: string;
    status: CommStatus;
    error?: string;
    providerId?: string;
  },
) {
  await prisma.communicationLog.create({
    data: {
      type: input.type,
      channel: "email",
      status: input.status,
      recipientEmail: input.to,
      recipientName: input.recipientName ?? "",
      teamId: input.teamId ?? null,
      subject: input.subject,
      body: input.body,
      templateKey: input.templateKey,
      providerId: input.providerId ?? null,
      error: input.error ?? null,
      sentById: input.sentById ?? null,
      sentAt: input.status === "FAILED" ? null : new Date(),
    },
  });
}
