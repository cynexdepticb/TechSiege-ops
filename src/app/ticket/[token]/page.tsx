import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { siteOrigin, SITE } from "@/lib/site";
import { teamQrDataUrl, teamTicketUrl } from "@/lib/ticket";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Your check-in ticket" };
// The page is per-token and the token is the whole authorisation, so it must not
// be cached or prerendered — a stale copy would show a revoked team's code.
export const dynamic = "force-dynamic";

/**
 * The team's own ticket. Public and unauthenticated on purpose: a volunteer
 * scanning this phone is the entire check-in flow, so the person holding the code
 * cannot be asked to log in first.
 *
 * The QR token is the only credential here. It is a 18-byte random value from
 * `makeToken`, not a guessable id, which is what makes an unauthenticated page
 * acceptable — but it is also bearer-secret, so the page deliberately reveals
 * nothing beyond what the scanner needs: team name, code and track.
 */
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const team = await prisma.team.findUnique({
    where: { qrToken: token },
    select: {
      name: true,
      code: true,
      college: true,
      contactName: true,
      status: true,
      paymentStatus: true,
      track: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!team) notFound();

  const qr = await teamQrDataUrl(teamTicketUrl(siteOrigin(), token));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">{SITE.name}</p>
        <h1 className="mt-2 text-2xl font-semibold">Check-in ticket</h1>
      </header>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mx-auto w-fit rounded-lg bg-white p-3">
          {/* Data URL from a locally generated QR — no external request. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`Check-in QR code for team ${team.code}`}
            width={280}
            height={280}
            className="block"
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Show this code at the registration desk. A volunteer scans it once per
          checkpoint, so keep it on your phone.
        </p>

        <div className="mt-4 text-center">
          <a
            href={`/ticket/${token}/pdf`}
            download
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            📥 Download Ticket (PDF)
          </a>
        </div>

        <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-sm">
          <Row label="Team ID" value={team.code} mono />
          <Row label="Team" value={team.name} />
          <Row label="Track" value={team.track.name} />
          <Row label="College" value={team.college} />
          <Row label="Members" value={String(team._count.participants)} />
          <Row label="Entry fee" value={team.paymentStatus === "PAID" ? "Paid" : "Not confirmed"} />
        </dl>
      </div>

      {team.paymentStatus !== "PAID" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-200">
          We have not confirmed your entry fee yet. You can still show this code,
          but please settle payment at the desk to avoid a queue.
        </p>
      ) : null}

      <footer className="text-center text-xs text-muted-foreground">
        <p>Regards, the {SITE.name} team</p>
        <p className="mt-1 opacity-70">Issued {formatDateTime(new Date())}</p>
      </footer>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono tracking-tight" : ""}`}>{value}</dd>
    </div>
  );
}
