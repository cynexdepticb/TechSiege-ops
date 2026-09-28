import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/prisma";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Clean text to WinAnsi/ASCII printable range to prevent PDF font encoding failures. */
export function cleanPdfText(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/** Generate a Crockford base-32 unique Ticket ID, e.g. TS26-K7M9PQ */
export function makeTicketId(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `TS26-${code}`;
}

/** Standardized ticket PDF filename per participant: TECHSIEGE-2026-<Member-Name>.pdf */
export function ticketMemberFilename(memberName: string): string {
  const sanitized = memberName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `TECHSIEGE-2026-${sanitized || "Member"}.pdf`;
}

/** Legacy team ticket filename. */
export function ticketFilename(teamCode: string): string {
  return `TECHSIEGE-2026-${teamCode}.pdf`;
}

/** Public, unauthenticated page a team opens to see its check-in code. */
export function teamTicketUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/ticket/${token}`;
}

/** Public, unauthenticated page for an individual participant's admission pass. */
export function participantTicketUrl(origin: string, tokenOrTicketId: string): string {
  return `${origin.replace(/\/$/, "")}/ticket/${tokenOrTicketId}`;
}

export function getTicketStorageDir(teamId: string): string {
  return path.join(process.cwd(), "data", "tickets", teamId);
}

export async function storeTicketPdf(
  teamId: string,
  filename: string,
  content: Buffer,
): Promise<string> {
  const dir = getTicketStorageDir(teamId);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, content);
  return path.join("data", "tickets", teamId, filename);
}

export async function readTicketPdf(teamId: string, filename: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(getTicketStorageDir(teamId), filename);
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export async function ticketPdfExists(teamId: string, filename: string): Promise<boolean> {
  try {
    const fullPath = path.join(getTicketStorageDir(teamId), filename);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/** Renders the check-in QR as a PNG buffer. */
export async function teamQrPng(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    type: "png",
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0e14", light: "#ffffff" },
  });
}

/** Inline data URL, for the <img> on the public ticket page. */
export async function teamQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0e14", light: "#ffffff" },
  });
}

export type ParticipantTicketPdfParams = {
  ticketId: string;
  qrToken: string;
  participantName: string;
  teamName: string;
  college: string;
  trackName: string;
  eventDate?: string;
  venue?: string;
};

/**
 * Renders an official individual TechSiege 2026 admission ticket in PDF form.
 */
export async function renderParticipantTicketPdf(params: ParticipantTicketPdfParams): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([620, 360]);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);

  // Background - Dark theme #0a0d12
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 620,
    height: 360,
    color: rgb(0.04, 0.05, 0.07),
  });

  // Outer border - Cyan accent #22d3ee
  page.drawRectangle({
    x: 12,
    y: 12,
    width: 596,
    height: 336,
    borderColor: rgb(0.13, 0.83, 0.93),
    borderWidth: 1.5,
  });

  // Top header banner
  page.drawText("TECHSIEGE 2026", {
    x: 28,
    y: 312,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("BUILD. AUTOMATE. ACT.", {
    x: 28,
    y: 296,
    size: 9,
    font: bold,
    color: rgb(0.13, 0.83, 0.93),
  });

  // Official Admission Badge
  page.drawRectangle({
    x: 245,
    y: 304,
    width: 155,
    height: 22,
    color: rgb(0.08, 0.15, 0.22),
    borderColor: rgb(0.13, 0.83, 0.93),
    borderWidth: 1,
  });
  page.drawText("OFFICIAL ADMISSION TICKET", {
    x: 253,
    y: 311,
    size: 8,
    font: bold,
    color: rgb(0.13, 0.83, 0.93),
  });

  // Dashed perforation line separating main pass from stub
  page.drawLine({
    start: { x: 418, y: 14 },
    end: { x: 418, y: 346 },
    thickness: 1,
    color: rgb(0.25, 0.32, 0.42),
    dashArray: [4, 4],
  });

  // Left Section - Participant Details
  page.drawText("PARTICIPANT NAME", {
    x: 28,
    y: 260,
    size: 8,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.participantName), {
    x: 28,
    y: 240,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("TEAM", {
    x: 28,
    y: 212,
    size: 8,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.teamName), {
    x: 28,
    y: 196,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("TRACK", {
    x: 210,
    y: 212,
    size: 8,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.trackName), {
    x: 210,
    y: 196,
    size: 12,
    font: bold,
    color: rgb(0.13, 0.83, 0.93),
  });

  page.drawText("COLLEGE / INSTITUTION", {
    x: 28,
    y: 168,
    size: 8,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.college), {
    x: 28,
    y: 152,
    size: 10.5,
    font,
    color: rgb(0.9, 0.93, 0.96),
  });

  // Event & Venue Card Box
  page.drawRectangle({
    x: 28,
    y: 35,
    width: 372,
    height: 95,
    color: rgb(0.06, 0.08, 0.12),
    borderColor: rgb(0.18, 0.24, 0.32),
    borderWidth: 1,
  });

  page.drawText("EVENT DATE", {
    x: 38,
    y: 110,
    size: 7.5,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.eventDate ?? "October 30-31, 2026"), {
    x: 38,
    y: 96,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("VENUE", {
    x: 38,
    y: 76,
    size: 7.5,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.venue || "Alva's Institute of Engineering and Technology,"), {
    x: 38,
    y: 62,
    size: 8.5,
    font,
    color: rgb(0.85, 0.89, 0.94),
  });
  page.drawText(cleanPdfText("Mijar Campus, Moodbidri, Mangaluru, Karnataka"), {
    x: 38,
    y: 49,
    size: 8.5,
    font,
    color: rgb(0.85, 0.89, 0.94),
  });

  // Instructions footnote
  page.drawText("Check-in: Arrive by 8:30 AM | Carry College ID Card | Present QR Code at Check-in Desk", {
    x: 38,
    y: 38,
    size: 6.5,
    font,
    color: rgb(0.5, 0.58, 0.68),
  });

  // Right Section - Stub
  page.drawText("TICKET ID", {
    x: 432,
    y: 324,
    size: 7.5,
    font: bold,
    color: rgb(0.55, 0.62, 0.72),
  });
  page.drawText(cleanPdfText(params.ticketId), {
    x: 432,
    y: 308,
    size: 13,
    font: mono,
    color: rgb(0.13, 0.83, 0.93),
  });

  // QR Code container box (Pure white background for maximum contrast & scannability)
  page.drawRectangle({
    x: 432,
    y: 112,
    width: 162,
    height: 180,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.85, 0.89, 0.94),
    borderWidth: 1,
  });

  page.drawText("CHECK-IN QR CODE", {
    x: 468,
    y: 277,
    size: 7.5,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const qrBuffer = await QRCode.toBuffer(params.qrToken, {
    type: "png",
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0e14", light: "#ffffff" },
  });
  const qrImage = await doc.embedPng(qrBuffer);
  page.drawImage(qrImage, {
    x: 440,
    y: 125,
    width: 146,
    height: 146,
  });

  page.drawText("Present this QR code at event check-in.", {
    x: 432,
    y: 78,
    size: 7.5,
    font: bold,
    color: rgb(0.85, 0.89, 0.94),
  });

  // Status pill
  page.drawRectangle({
    x: 432,
    y: 40,
    width: 162,
    height: 24,
    color: rgb(0.08, 0.2, 0.1),
    borderColor: rgb(0.4, 0.8, 0.2),
    borderWidth: 1,
  });
  page.drawText("PAYMENT VERIFIED - ADMIT ONE", {
    x: 437,
    y: 48,
    size: 7.5,
    font: bold,
    color: rgb(0.64, 0.9, 0.21),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

export type TeamMemberTicketResult = {
  participantId: string;
  name: string;
  email: string;
  role: string;
  ticketId: string;
  qrToken: string;
  filename: string;
  path: string;
  buffer: Buffer;
  checkedIn: boolean;
  checkedInAt: Date | null;
  checkedInBy: string | null;
};

/**
 * Idempotently ensures individual PDF tickets exist on disk and database
 * for every member of the team. Re-running reuses existing IDs, tokens, and files.
 */
export async function ensureTeamTicketPdfs(teamId: string): Promise<TeamMemberTicketResult[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      track: true,
      participants: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const results: TeamMemberTicketResult[] = [];

  for (const p of team.participants) {
    const ticketId = p.ticketId || makeTicketId();
    const qrToken = p.qrToken || `TECHSIEGE:TICKET:${randomUUID()}`;
    const filename = p.pdfFilename || ticketMemberFilename(p.name);

    let pdfBuf = await readTicketPdf(team.id, filename);
    if (!pdfBuf) {
      pdfBuf = await renderParticipantTicketPdf({
        ticketId,
        qrToken,
        participantName: p.name,
        teamName: team.name,
        college: p.college || team.college,
        trackName: team.track.name,
        eventDate: "October 30-31, 2026",
        venue: "Alva's Institute of Engineering and Technology, Mijar, Moodbidri",
      });
      await storeTicketPdf(team.id, filename, pdfBuf);
    }

    const relPath = path.join("data", "tickets", team.id, filename);

    if (!p.ticketId || !p.qrToken || !p.pdfFilename || !p.pdfPath) {
      await prisma.participant.update({
        where: { id: p.id },
        data: {
          ticketId,
          qrToken,
          pdfFilename: filename,
          pdfPath: relPath,
          pdfGeneratedAt: p.pdfGeneratedAt || new Date(),
        },
      });
    }

    results.push({
      participantId: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      ticketId,
      qrToken,
      filename,
      path: relPath,
      buffer: pdfBuf,
      checkedIn: p.checkedIn,
      checkedInAt: p.checkedInAt,
      checkedInBy: p.checkedInBy,
    });
  }

  return results;
}

export type TeamTicketPdfParams = {
  teamCode: string;
  teamName: string;
  college: string;
  trackName: string;
  qrContent: string;
  participantCount?: number;
  contactName?: string;
  eventDate?: string;
  venue?: string;
};

/** Legacy team ticket PDF generator. */
export async function renderTeamTicketPdf(params: TeamTicketPdfParams): Promise<Buffer> {
  return renderParticipantTicketPdf({
    ticketId: params.teamCode,
    qrToken: params.qrContent,
    participantName: params.contactName || params.teamName,
    teamName: params.teamName,
    college: params.college,
    trackName: params.trackName,
    eventDate: params.eventDate,
    venue: params.venue,
  });
}
