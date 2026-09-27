import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sendEmail, type EmailAttachment } from "@/lib/email/send";
import { ensureTeamTicketPdfs, type TeamMemberTicketResult } from "@/lib/ticket";

export type PaymentOutcome = {
  ok: boolean;
  reason?: string;
  sent: number;
  recipients: number;
  undelivered: string[];
  ticketCount?: number;
  tickets?: {
    participantId: string;
    name: string;
    ticketId: string;
    filename: string;
  }[];
};

function formatAmount(value: unknown): string {
  if (value === null || value === undefined) return "";
  const asNumber =
    typeof value === "object" && value !== null && "toFixed" in value
      ? (value as { toFixed: (n: number) => string }).toFixed(2)
      : String(value);
  const n = Number(asNumber);
  if (Number.isNaN(n)) return asNumber;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function buildConfirmationEmailBody(data: {
  leaderName: string;
  teamName: string;
  teamCode: string;
  college: string;
  trackName: string;
  tickets: TeamMemberTicketResult[];
}): { text: string; html: string; subject: string } {
  const subject = "TechSiege 2026 — Registration Confirmed & Tickets";

  const memberListText = data.tickets
    .map((t, idx) => `  - Member ${idx + 1}: ${t.name} — Ticket ID: ${t.ticketId}`)
    .join("\n");

  const text = `Hi ${data.leaderName},

We've received and verified the entry fee for team ${data.teamName}. Your registration for TechSiege 2026 is officially confirmed!

Team Details:
- Team Name: ${data.teamName}
- Team ID: ${data.teamCode}
- Track: ${data.trackName}
- College: ${data.college}

Attached to this email are the admission tickets for all registered team members. Each ticket contains a unique QR code required for check-in at the venue. Please share each ticket with the respective member.

Registered Members & Ticket IDs:
${memberListText}

Event Details:
- Event: TechSiege 2026 (BUILD. AUTOMATE. ACT.)
- Event Date: October 30–31, 2026
- Venue: Alva's Institute of Engineering and Technology, Mijar, Moodbidri
- Check-in Time: 8:30 AM

Check-in Instructions:
1. Every team member must present their individual PDF ticket (digital or printed).
2. Carry a valid College ID card.
3. Arrive by 8:30 AM for badge collection and setup.

See you on October 30–31, 2026 at AIET, Mijar Campus!

Warm regards,
The TechSiege Operations Team`;

  const memberListHtml = data.tickets
    .map(
      (t, idx) =>
        `<li style="margin:4px 0"><strong>Member ${idx + 1}:</strong> ${t.name} &mdash; <code style="background:#1a202c;padding:2px 6px;border-radius:4px;color:#22d3ee;font-family:monospace">${t.ticketId}</code></li>`,
    )
    .join("");

  const html = `<div style="font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#e8ecf1;background:#0a0c10;padding:32px;border:1px solid #202634;border-radius:12px">
  <div style="margin-bottom:20px;border-bottom:1px solid #202634;padding-bottom:16px">
    <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#22d3ee">TechSiege 2026 &middot; BUILD. AUTOMATE. ACT.</span>
    <h1 style="margin:8px 0 0;font-size:20px;color:#ffffff">Registration Confirmed &amp; Tickets</h1>
  </div>

  <p style="margin:0 0 16px;line-height:1.6">Hi ${data.leaderName},</p>
  <p style="margin:0 0 16px;line-height:1.6">We have verified your entry fee payment for <strong>team ${data.teamName}</strong>. Your seat is officially confirmed!</p>

  <div style="background:#11151f;border:1px solid #232b3d;border-radius:8px;padding:16px;margin:20px 0">
    <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;text-transform:uppercase">Team Information</div>
    <div style="font-size:14px;line-height:1.6">
      <div><strong>Team Name:</strong> ${data.teamName}</div>
      <div><strong>Team ID:</strong> <span style="font-family:monospace;color:#22d3ee;font-weight:bold">${data.teamCode}</span></div>
      <div><strong>Track:</strong> ${data.trackName}</div>
      <div><strong>College:</strong> ${data.college}</div>
    </div>
  </div>

  <div style="background:#0f1d2b;border:1px solid #1e3a5f;border-radius:8px;padding:16px;margin:20px 0">
    <div style="font-size:13px;font-weight:700;color:#38bdf8;margin-bottom:6px">&#128206; Admission Tickets Attached</div>
    <p style="margin:0;font-size:13.5px;line-height:1.55;color:#e0f2fe">
      <strong>Attached to this email are the admission tickets for all registered team members.</strong> Each ticket contains a unique QR code required for check-in at the venue. Please share each ticket with the respective member.
    </p>
  </div>

  <div style="margin:20px 0">
    <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;text-transform:uppercase">Team Members &amp; Ticket IDs</div>
    <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6">
      ${memberListHtml}
    </ul>
  </div>

  <div style="background:#11151f;border:1px solid #232b3d;border-radius:8px;padding:16px;margin:20px 0;font-size:13.5px;line-height:1.6">
    <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;text-transform:uppercase">Event Details</div>
    <div><strong>Event:</strong> TechSiege 2026</div>
    <div><strong>Dates:</strong> October 30&ndash;31, 2026</div>
    <div><strong>Venue:</strong> Alva's Institute of Engineering and Technology, Mijar, Moodbidri</div>
    <div><strong>Check-in Time:</strong> 8:30 AM</div>
  </div>

  <p style="margin:20px 0 8px;font-size:13.5px;line-height:1.6;color:#cbd5e1">See you at TechSiege 2026!</p>
  <p style="margin:0;font-size:13.5px;color:#94a3b8">The TechSiege Operations Team</p>
</div>`;

  return { text, html, subject };
}

/**
 * When Ops verifies a team's payment:
 * 1. PAYMENT VERIFIED (paymentStatus = "PAID")
 * 2. REGISTRATION CONFIRMED (status = "CONFIRMED")
 * 3. GENERATE ONE PDF TICKET FOR EACH TEAM MEMBER (with unique QR code)
 * 4. SEND ONE EMAIL TO TEAM LEADER with ALL member ticket PDFs as attachments
 */
export async function markTeamPaid(input: {
  teamId: string;
  amountPaid?: number | null;
  paymentRef?: string;
  actorId: string;
  actorEmail?: string;
}): Promise<PaymentOutcome> {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    include: {
      track: true,
      participants: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!team) {
    return { ok: false, reason: "Team not found.", sent: 0, recipients: 0, undelivered: [] };
  }

  const alreadyPaid = team.paymentStatus === "PAID";
  const amount = input.amountPaid ?? null;

  // 1 & 2: Update team to PAID & CONFIRMED
  await prisma.team.update({
    where: { id: input.teamId },
    data: {
      paymentStatus: "PAID",
      status: "CONFIRMED",
      amountPaid: amount === null ? undefined : amount,
      paymentRef: input.paymentRef?.trim() || team.paymentRef,
      paidAt: team.paidAt ?? new Date(),
      paidById: input.actorId,
    },
  });

  await audit({
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: alreadyPaid ? "team.payment.reconfirmed" : "team.payment.confirmed",
    entityType: "team",
    entityId: team.id,
    before: {
      paymentStatus: team.paymentStatus,
      status: team.status,
      amountPaid: team.amountPaid === null ? null : formatAmount(team.amountPaid),
      paymentRef: team.paymentRef,
    },
    after: {
      paymentStatus: "PAID",
      status: "CONFIRMED",
      amountPaid: amount === null ? formatAmount(team.amountPaid) : formatAmount(amount),
      paymentRef: input.paymentRef?.trim() || team.paymentRef,
    },
  });

  // 3: Generate / Ensure individual PDF tickets for all team members
  const tickets = await ensureTeamTicketPdfs(team.id);

  // 4: Send ONE email to team leader with all ticket PDFs attached
  const leader =
    team.participants.find((p) => p.role === "LEADER") ||
    team.participants[0] || {
      name: team.contactName || "Team Leader",
      email: team.contactEmail,
    };

  const recipientEmail = leader.email || team.contactEmail;
  if (!recipientEmail) {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        ticketEmailStatus: "FAILED",
        ticketEmailLastError: "No leader or contact email found on team.",
      },
    });
    return {
      ok: true,
      reason: "Payment verified and tickets generated, but team has no email address.",
      sent: 0,
      recipients: 1,
      undelivered: ["(no email address)"],
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        participantId: t.participantId,
        name: t.name,
        ticketId: t.ticketId,
        filename: t.filename,
      })),
    };
  }

  const emailBody = buildConfirmationEmailBody({
    leaderName: firstName(leader.name),
    teamName: team.name,
    teamCode: team.code,
    college: team.college,
    trackName: team.track.name,
    tickets,
  });

  const attachments: EmailAttachment[] = tickets.map((t) => ({
    filename: t.filename,
    content: t.buffer,
    contentType: "application/pdf",
  }));

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject: emailBody.subject,
    html: emailBody.html,
    attachments,
  });

  // Log in CommunicationLog
  await prisma.communicationLog.create({
    data: {
      type: "PAYMENT_ACKNOWLEDGEMENT",
      channel: "email",
      status: sendResult.status,
      recipientEmail,
      recipientName: leader.name,
      teamId: team.id,
      subject: emailBody.subject,
      body: emailBody.text,
      templateKey: "payment_confirmation_tickets",
      providerId: sendResult.providerId ?? null,
      error: sendResult.error ?? null,
      sentById: input.actorId,
      sentAt: sendResult.status === "SENT" ? new Date() : null,
    },
  });

  if (sendResult.status === "SENT") {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        ticketSentAt: new Date(),
        ticketEmailStatus: "SENT",
        ticketEmailLastError: "",
      },
    });
    return {
      ok: true,
      sent: 1,
      recipients: 1,
      undelivered: [],
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        participantId: t.participantId,
        name: t.name,
        ticketId: t.ticketId,
        filename: t.filename,
      })),
    };
  } else {
    const errorMsg = sendResult.error || "Email delivery failed.";
    await prisma.team.update({
      where: { id: team.id },
      data: {
        ticketEmailStatus: "FAILED",
        ticketEmailLastError: errorMsg,
      },
    });
    return {
      ok: true,
      reason: errorMsg,
      sent: 0,
      recipients: 1,
      undelivered: [recipientEmail],
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        participantId: t.participantId,
        name: t.name,
        ticketId: t.ticketId,
        filename: t.filename,
      })),
    };
  }
}

/**
 * Resends the confirmation email with the existing member ticket PDFs attached.
 * Idempotent: Does NOT regenerate ticket IDs or tokens, uses the exact existing files.
 */
export async function resendTeamTickets(input: {
  teamId: string;
  actorId: string;
  actorEmail?: string;
}): Promise<PaymentOutcome> {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    include: {
      track: true,
      participants: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!team) {
    return { ok: false, reason: "Team not found.", sent: 0, recipients: 0, undelivered: [] };
  }

  if (team.paymentStatus !== "PAID") {
    return {
      ok: false,
      reason: "Payment must be verified before sending tickets.",
      sent: 0,
      recipients: 1,
      undelivered: [],
    };
  }

  // Ensures existing PDFs are loaded (and generates if not previously stored) without changing IDs
  const tickets = await ensureTeamTicketPdfs(team.id);

  const leader =
    team.participants.find((p) => p.role === "LEADER") ||
    team.participants[0] || {
      name: team.contactName || "Team Leader",
      email: team.contactEmail,
    };

  const recipientEmail = leader.email || team.contactEmail;
  if (!recipientEmail) {
    return {
      ok: false,
      reason: "No email address found for the team leader.",
      sent: 0,
      recipients: 1,
      undelivered: ["(no email address)"],
    };
  }

  const emailBody = buildConfirmationEmailBody({
    leaderName: firstName(leader.name),
    teamName: team.name,
    teamCode: team.code,
    college: team.college,
    trackName: team.track.name,
    tickets,
  });

  const attachments: EmailAttachment[] = tickets.map((t) => ({
    filename: t.filename,
    content: t.buffer,
    contentType: "application/pdf",
  }));

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject: emailBody.subject,
    html: emailBody.html,
    attachments,
  });

  await prisma.communicationLog.create({
    data: {
      type: "TICKET_ISSUED",
      channel: "email",
      status: sendResult.status,
      recipientEmail,
      recipientName: leader.name,
      teamId: team.id,
      subject: emailBody.subject,
      body: emailBody.text,
      templateKey: "resend_tickets",
      providerId: sendResult.providerId ?? null,
      error: sendResult.error ?? null,
      sentById: input.actorId,
      sentAt: sendResult.status === "SENT" ? new Date() : null,
    },
  });

  if (sendResult.status === "SENT") {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        status: "CONFIRMED",
        ticketSentAt: new Date(),
        ticketEmailStatus: "SENT",
        ticketEmailLastError: "",
      },
    });

    await audit({
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: "team.tickets.resent",
      entityType: "team",
      entityId: team.id,
      after: { recipient: recipientEmail, ticketCount: tickets.length },
    });

    return {
      ok: true,
      sent: 1,
      recipients: 1,
      undelivered: [],
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        participantId: t.participantId,
        name: t.name,
        ticketId: t.ticketId,
        filename: t.filename,
      })),
    };
  } else {
    const errorMsg = sendResult.error || "Failed to resend tickets.";
    await prisma.team.update({
      where: { id: team.id },
      data: {
        ticketEmailStatus: "FAILED",
        ticketEmailLastError: errorMsg,
      },
    });
    return {
      ok: true,
      reason: errorMsg,
      sent: 0,
      recipients: 1,
      undelivered: [recipientEmail],
      ticketCount: tickets.length,
    };
  }
}

/** Legacy alias for backward compatibility. */
export async function sendTeamTicket(input: {
  teamId: string;
  actorId: string;
  actorEmail?: string;
}): Promise<PaymentOutcome> {
  return resendTeamTickets(input);
}
