import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { renderTeamTicketPdf, ticketFilename } from "@/lib/ticket";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /ticket/[token]/pdf
 *
 * Downloads/previews the team's official admission ticket in PDF form.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const team = await prisma.team.findUnique({
    where: { qrToken: token },
    select: {
      name: true,
      code: true,
      college: true,
      contactName: true,
      qrToken: true,
      status: true,
      paymentStatus: true,
      track: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!team) notFound();

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
