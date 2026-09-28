import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard, fail } from "@/lib/http";
import {
  ensureTeamTicketPdfs,
  makeTicketId,
  readTicketPdf,
  renderParticipantTicketPdf,
  ticketMemberFilename,
} from "@/lib/ticket";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await guard("teams", "read");
  if ("response" in auth) return auth.response;

  const { id } = await ctx.params;

  const participant = await prisma.participant.findUnique({
    where: { id },
    include: {
      team: {
        include: {
          track: true,
        },
      },
    },
  });

  if (!participant || !participant.team) {
    return fail(404, "Participant not found.");
  }

  const team = participant.team;
  const filename = participant.pdfFilename || ticketMemberFilename(participant.name);

  let pdfBuf = await readTicketPdf(team.id, filename);

  if (!pdfBuf) {
    // Attempt generation if missing on disk
    try {
      const tickets = await ensureTeamTicketPdfs(team.id);
      const match = tickets.find((t) => t.participantId === participant.id);
      if (match) {
        pdfBuf = match.buffer;
      }
    } catch {
      // Fallback direct render
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

  if (!pdfBuf) {
    return fail(404, "Ticket PDF not found.");
  }

  return new Response(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
