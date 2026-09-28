import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ensureTeamTicketPdfs,
  makeTicketId,
  readTicketPdf,
  renderParticipantTicketPdf,
  renderTeamTicketPdf,
  ticketFilename,
  ticketMemberFilename,
} from "@/lib/ticket";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /ticket/[token]/pdf
 *
 * Downloads/previews the participant's or team's official admission ticket in PDF form.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const cleanToken = token.trim();

  // 1. Try participant lookup by qrToken or ticketId
  const participant = await prisma.participant.findFirst({
    where: {
      OR: [
        { qrToken: cleanToken },
        { qrToken: `TECHSIEGE:TICKET:${cleanToken}` },
        { qrToken: cleanToken.replace(/^TECHSIEGE:TICKET:/i, "") },
        { ticketId: { equals: cleanToken, mode: "insensitive" } },
      ],
    },
    include: {
      team: {
        include: {
          track: true,
        },
      },
    },
  });

  if (participant && participant.team) {
    const team = participant.team;
    const filename = participant.pdfFilename || ticketMemberFilename(participant.name);
    let pdfBuf = await readTicketPdf(team.id, filename);

    if (!pdfBuf) {
      try {
        const tickets = await ensureTeamTicketPdfs(team.id);
        const match = tickets.find((t) => t.participantId === participant.id);
        if (match) pdfBuf = match.buffer;
      } catch {
        pdfBuf = await renderParticipantTicketPdf({
          ticketId: participant.ticketId || makeTicketId(),
          qrToken: participant.qrToken || team.qrToken,
          participantName: participant.name,
          teamName: team.name,
          college: participant.college || team.college,
          trackName: team.track.name,
          eventDate: "October 30-31, 2026",
          venue: "Alva's Institute of Engineering and Technology, Mijar, Moodbidri",
        });
      }
    }

    if (!pdfBuf) notFound();

    return new Response(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuf.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 2. Fall back to team lookup
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { qrToken: cleanToken },
        { code: { equals: cleanToken, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      college: true,
      contactName: true,
      qrToken: true,
      status: true,
      paymentStatus: true,
      track: { select: { name: true } },
      participants: {
        select: {
          id: true,
          name: true,
          ticketId: true,
          pdfFilename: true,
        },
      },
      _count: { select: { participants: true } },
    },
  });

  if (!team) notFound();

  // If team has participants and is confirmed/paid, prefer the leader's or first member's PDF
  if (team.participants.length > 0) {
    const p = team.participants[0];
    const filename = p.pdfFilename || ticketMemberFilename(p.name);
    const pdfBuf = await readTicketPdf(team.id, filename);
    if (pdfBuf) {
      return new Response(new Uint8Array(pdfBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": String(pdfBuf.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  const pdfBuf = await renderTeamTicketPdf({
    teamCode: team.code,
    teamName: team.name,
    college: team.college,
    trackName: team.track.name,
    qrContent: team.qrToken,
    participantCount: team._count.participants,
    contactName: team.contactName,
    eventDate: "October 30-31, 2026",
    venue: "Alva's Institute of Engineering and Technology, Mijar Campus, Mangaluru, Karnataka",
  });

  const filename = ticketFilename(team.code);

  return new Response(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(pdfBuf.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
