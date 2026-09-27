import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { REGISTRATION } from "@/lib/constants";
import { teamTicketUrl } from "@/lib/ticket";

/** Human-friendly, unambiguous team code: no O/0/I/1. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function makeTeamCode(): string {
  const bytes = randomBytes(4);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `AGX-${suffix}`;
}

export function makeToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function makeDraftToken(): string {
  return `draft_${randomUUID()}`;
}

/** Reads a team's QR token out of whatever the scanner handed us. */
export function extractQrToken(payload: string): string {
  const trimmed = payload.trim();
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("t") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Kept under its old name because callers read as "where do I send this team to
 * check in". It now points at /ticket/<token> — the page that actually exists.
 * The old /checkin/<token> shape had no matching route and 404'd, so every link
 * derived from it was dead.
 */
export function teamCheckinUrl(origin: string, token: string): string {
  return teamTicketUrl(origin, token);
}

/** Tracks how many teams are registered against the configured cap. */
export async function teamCount(): Promise<number> {
  return prisma.team.count({ where: { status: { not: "DISQUALIFIED" } } });
}

export async function registrationsRemaining(maxTeams: number): Promise<number> {
  return Math.max(0, maxTeams - (await teamCount()));
}

/**
 * Registrations run in one transaction: if a member email is already taken the
 * whole team is rejected, so we never leave a half-created team behind.
 */
export async function createTeamAndMembers(input: {
  team: {
    name: string;
    college: string;
    city: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    projectIdea: string;
    trackId: string;
  };
  members: {
    name: string;
    email: string;
    phone: string;
    college: string;
    year: string;
    isLeader: boolean;
  }[];
  status?: "PENDING" | "CONFIRMED";
  /**
   * The originating row's id in the marketing site's own table, when the team
   * arrived by forwarding. Persisted so the import script and a retried forward
   * both recognise the team as already present.
   */
  sourceRef?: string;
}) {
  const emails = input.members.map((m) => m.email.toLowerCase());

  const conflicts = await prisma.participant.findMany({
    where: { email: { in: emails } },
    select: { email: true, team: { select: { name: true } } },
  });
  if (conflicts.length > 0) {
    return {
      ok: false as const,
      code: "EMAIL_TAKEN" as const,
      conflicts: conflicts.map((c) => ({ email: c.email, team: c.team?.name ?? null })),
    };
  }

  const track = await prisma.track.findUnique({
    where: { id: input.team.trackId },
    select: { id: true, name: true, capacity: true, active: true },
  });
  if (!track || !track.active) {
    return { ok: false as const, code: "TRACK_UNAVAILABLE" as const };
  }

  // Retry on the rare chance of a code collision.
  let code = makeTeamCode();
  for (let i = 0; i < 5; i++) {
    const taken = await prisma.team.findUnique({ where: { code }, select: { id: true } });
    if (!taken) break;
    code = makeTeamCode();
  }

  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          code,
          name: input.team.name,
          college: input.team.college,
          city: input.team.city,
          contactName: input.team.contactName,
          contactEmail: input.team.contactEmail.toLowerCase(),
          contactPhone: input.team.contactPhone,
          projectIdea: input.team.projectIdea,
          trackId: input.team.trackId,
          status: input.status ?? "PENDING",
          qrToken: makeToken(18),
          ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
        },
      });

      await tx.participant.createMany({
        data: input.members.map((m) => ({
          name: m.name,
          email: m.email.toLowerCase(),
          phone: m.phone,
          college: m.college,
          year: m.year,
          role: m.isLeader ? ("LEADER" as const) : ("MEMBER" as const),
          teamId: created.id,
        })),
      });

      return created;
    });

    return { ok: true as const, team };
  } catch (e) {
    // The unique index on participants.email can still fire under
    // concurrency even after the pre-check, so map P2002 to the same result.
    if (isUniqueViolation(e)) {
      return { ok: false as const, code: "EMAIL_TAKEN" as const, conflicts: [] };
    }
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

export { REGISTRATION };
