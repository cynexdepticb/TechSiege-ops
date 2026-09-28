import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { siteOrigin, SITE } from "@/lib/site";
import { teamQrDataUrl } from "@/lib/ticket";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admission Ticket · TechSiege 2026" };
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated ticket page.
 * Supports individual participant tickets (via qrToken or ticketId)
 * as well as team passes (via team qrToken or team code).
 */
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleanToken = token.trim();

  // 1. Try participant lookup
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
          track: { select: { name: true } },
          participants: {
            select: {
              id: true,
              name: true,
              role: true,
              ticketId: true,
              qrToken: true,
              checkedIn: true,
            },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (participant && participant.team) {
    const team = participant.team;
    // Generate QR code for this specific participant
    const qrPayload = participant.qrToken || `TECHSIEGE:TICKET:${participant.ticketId || participant.id}`;
    const qrDataUrl = await teamQrDataUrl(qrPayload);

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-cyan-400">
            TechSiege 2026 &middot; BUILD. AUTOMATE. ACT.
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Official Admission Ticket
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admit One &middot; Individual Participant Pass
          </p>
        </header>

        <div className="rounded-2xl border border-cyan-800/40 bg-gradient-to-b from-card to-card/90 p-6 shadow-xl shadow-cyan-950/20">
          {/* Header Badge */}
          <div className="flex items-center justify-between border-b border-border/80 pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Participant Name
              </span>
              <div className="text-xl font-bold text-foreground flex items-center gap-2">
                <span>{participant.name}</span>
                {participant.role === "LEADER" ? (
                  <span className="rounded bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800/50">
                    Lead
                  </span>
                ) : null}
              </div>
            </div>
            {participant.ticketId ? (
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Ticket ID
                </span>
                <div className="font-mono text-base font-bold text-cyan-400">
                  {participant.ticketId}
                </div>
              </div>
            ) : null}
          </div>

          {/* QR Code Container */}
          <div className="my-5 flex flex-col items-center">
            <div className="rounded-xl border-2 border-cyan-500/30 bg-white p-3 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`Admission QR Code for ${participant.name}`}
                width={240}
                height={240}
                className="block"
              />
            </div>
            <p className="mt-3 text-center text-xs font-medium text-foreground">
              Present this personal QR code at event check-in
            </p>
            <p className="text-center font-mono text-[11px] text-muted-foreground mt-0.5">
              {participant.ticketId || qrPayload.substring(0, 24)}
            </p>
          </div>

          {/* Check-in status badge */}
          <div className="mb-4">
            {participant.checkedIn ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2 px-3 text-xs font-semibold text-emerald-300">
                <span>&#10003; Checked in &amp; Admitted to Venue</span>
              </div>
            ) : team.paymentStatus === "PAID" ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 py-2 px-3 text-xs font-semibold text-cyan-300">
                <span>&#9679; Payment Verified &middot; Ready for Event Check-in</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 py-2 px-3 text-xs font-semibold text-amber-200">
                <span>Payment Confirmation Pending</span>
              </div>
            )}
          </div>

          {/* Download button */}
          <div className="text-center">
            <a
              href={`/ticket/${participant.ticketId || participant.qrToken || token}/pdf`}
              download
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 shadow-sm"
            >
              📥 Download Individual Ticket (PDF)
            </a>
          </div>

          {/* Event & Team Details */}
          <dl className="mt-5 space-y-2 border-t border-border/80 pt-4 text-xs">
            <Row label="Team" value={team.name} />
            <Row label="Team Code" value={team.code} mono />
            <Row label="Track" value={team.track.name} />
            <Row label="Institution" value={participant.college || team.college} />
            <Row label="Event Date" value="October 30–31, 2026" />
            <Row label="Venue" value="Alva's Institute of Engineering and Technology, Moodbidri" />
          </dl>

          {/* Other Teammates */}
          {team.participants.length > 1 ? (
            <div className="mt-5 border-t border-border/80 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                Team Members ({team.participants.length})
              </span>
              <div className="space-y-1.5">
                {team.participants.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${
                      m.id === participant.id
                        ? "bg-cyan-950/60 border border-cyan-800/60 font-semibold text-cyan-300"
                        : "bg-muted/40 hover:bg-muted/70 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{m.name}</span>
                      {m.role === "LEADER" ? (
                        <span className="text-[9px] bg-cyan-900/50 text-cyan-400 px-1 py-0.2 rounded">
                          Lead
                        </span>
                      ) : null}
                    </div>
                    {m.id === participant.id ? (
                      <span className="text-[10px] text-cyan-400">Viewing</span>
                    ) : (
                      <Link
                        href={`/ticket/${m.ticketId || m.qrToken}`}
                        className="text-[10px] text-cyan-400 hover:underline"
                      >
                        View Pass &rarr;
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="text-center text-xs text-muted-foreground">
          <p>Regards, the TechSiege Operations Team</p>
          <p className="mt-1 opacity-70">
            {team.paidAt ? `Confirmed ${formatDateTime(team.paidAt)}` : "TechSiege 2026 Official Admission Pass"}
          </p>
        </footer>
      </main>
    );
  }

  // 2. Team lookup fallback
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { qrToken: cleanToken },
        { code: { equals: cleanToken, mode: "insensitive" } },
      ],
    },
    select: {
      name: true,
      code: true,
      college: true,
      contactName: true,
      status: true,
      paymentStatus: true,
      paidAt: true,
      track: { select: { name: true } },
      participants: {
        select: {
          id: true,
          name: true,
          role: true,
          ticketId: true,
          qrToken: true,
          checkedIn: true,
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      _count: { select: { participants: true } },
    },
  });

  if (!team) notFound();

  const qr = await teamQrDataUrl(token);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-8">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-cyan-400">
          TechSiege 2026 &middot; BUILD. AUTOMATE. ACT.
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          Team Check-in Pass
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {team.name} &middot; {team.code}
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`Check-in QR code for team ${team.code}`}
            width={240}
            height={240}
            className="block"
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Team pass for {team.name}. Select a member below to view their individual admission ticket and distinct QR code.
        </p>

        {/* Member Tickets Quick Links */}
        {team.participants.length > 0 ? (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
              Individual Member Tickets &amp; QR Codes
            </span>
            <div className="grid gap-2">
              {team.participants.map((m) => (
                <Link
                  key={m.id}
                  href={`/ticket/${m.ticketId || m.qrToken}`}
                  className="flex items-center justify-between rounded-lg border border-cyan-800/40 bg-cyan-950/30 p-2.5 text-xs hover:bg-cyan-950/60 transition"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span>{m.name}</span>
                      {m.role === "LEADER" ? (
                        <span className="rounded bg-cyan-900/60 px-1.5 py-0.2 text-[9px] text-cyan-300">
                          Lead
                        </span>
                      ) : null}
                    </div>
                    {m.ticketId ? (
                      <span className="font-mono text-[11px] text-cyan-400">
                        {m.ticketId}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-cyan-400 font-medium text-[11px]">
                    View QR &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
          <Row label="Team Code" value={team.code} mono />
          <Row label="Team" value={team.name} />
          <Row label="Track" value={team.track.name} />
          <Row label="College" value={team.college} />
          <Row label="Registered Members" value={String(team._count.participants)} />
          <Row label="Payment Status" value={team.paymentStatus === "PAID" ? "Verified" : "Pending"} />
        </dl>
      </div>

      <footer className="text-center text-xs text-muted-foreground">
        <p>Regards, the {SITE.name} Operations Team</p>
        <p className="mt-1 opacity-70">
          {team.paidAt ? `Confirmed ${formatDateTime(team.paidAt)}` : "TechSiege 2026 Official Team Pass"}
        </p>
      </footer>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono tracking-tight text-cyan-400" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
