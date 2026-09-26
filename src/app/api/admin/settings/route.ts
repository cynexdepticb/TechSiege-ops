import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { settingSchema, staffSchema } from "@/lib/validation";
import { setSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { SETTING_KEYS } from "@/lib/constants";
import { hashPassword } from "@/lib/password";

/**
 * Judges and mentors resolve their portal through a PanelMember row keyed on
 * `userId`, so an account without one signs in to nothing. Work out which
 * roster row to attach: an explicit id wins, otherwise match the email — which
 * is what happens in practice, since the roster entry is added first and the
 * login second. Read-only; the caller applies the link in its transaction.
 */
async function findPanelLink(
  userId: string | undefined,
  role: string,
  email: string,
  panelMemberId?: string | null,
): Promise<{ memberId: string } | { error: string } | null> {
  const wanted = role === "JUDGE" || role === "MENTOR";
  if (!wanted && !panelMemberId) return null;

  if (userId) {
    const already = await prisma.panelMember.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (already) return null; // already linked, nothing to do
  }

  const member = panelMemberId
    ? await prisma.panelMember.findUnique({
        where: { id: panelMemberId },
        select: { id: true, kind: true, userId: true },
      })
    : await prisma.panelMember.findUnique({
        where: { email },
        select: { id: true, kind: true, userId: true },
      });

  if (!member) {
    return wanted
      ? {
          error:
            `Add them to the panel roster first, then create the login — ` +
            `a ${role.toLowerCase()} account needs a panel record to reach their portal.`,
        }
      : { error: "No panel record with that id." };
  }
  if (member.userId && member.userId !== userId) {
    return { error: "That panel record already has a login attached to it." };
  }
  if (wanted && member.kind !== role) {
    return { error: `That panel record is a ${member.kind.toLowerCase()}, not a ${role.toLowerCase()}.` };
  }
  return { memberId: member.id };
}

export const dynamic = "force-dynamic";

/** Settings changes and staff account management. Super admin only. */
export async function POST(req: Request) {
  const auth = await guard("settings", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const action = (raw as { action?: string }).action;

  /* ── update a single setting ── */
  if (action === "setting") {
    const parsed = settingSchema.safeParse(raw);
    if (!parsed.success) return zodFail(parsed.error as ZodError);
    const { key, value } = parsed.data;

    // Guard the keys the app actually reads, so a typo can't create dead config.
    const known = new Set<string>(Object.values(SETTING_KEYS));
    if (!known.has(key)) {
      return fail(422, `Unknown setting "${key}". Known keys: ${[...known].join(", ")}.`);
    }

    if (key === SETTING_KEYS.submissionDeadline && Number.isNaN(Date.parse(value))) {
      return fail(422, "Submission deadline is not a valid date.");
    }
    if (key === SETTING_KEYS.maxTeams && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
      return fail(422, "Max teams must be a whole number of at least 1.");
    }
    if (key === SETTING_KEYS.registrationOpen && !["true", "false"].includes(value)) {
      return fail(422, "Registration open must be true or false.");
    }

    const before = await prisma.setting.findUnique({ where: { key } });
    await setSetting(key, value, auth.actor.id);

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "setting.update",
      entityType: "setting",
      entityId: key,
      before: before ? { value: before.value } : undefined,
      after: { value },
    });

    return NextResponse.json({ ok: true });
  }

  /* ── create a staff account ── */
  if (action === "create-staff") {
    const parsed = staffSchema.safeParse(raw);
    if (!parsed.success) return zodFail(parsed.error as ZodError);
    const input = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return fail(409, "An account with that email already exists.");

    const link = await findPanelLink(undefined, input.role, input.email, input.panelMemberId);
    if (link && "error" in link) return fail(422, link.error);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          vertical: input.role === "TEAM_LEAD" ? input.vertical : null,
          active: true,
          passwordHash: await hashPassword(input.password ?? crypto.randomUUID()),
        },
        select: { id: true, email: true, role: true },
      });

      if (link && "memberId" in link) {
        await tx.panelMember.update({
          where: { id: link.memberId },
          data: { userId: created.id },
        });
      }
      if (input.volunteerId) {
        await tx.volunteer.update({ where: { id: input.volunteerId }, data: { userId: created.id } });
      }
      return created;
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      after: { email: user.email, role: user.role, panelLinked: Boolean(link && "memberId" in link) },
    });

    return NextResponse.json({ ok: true, user });
  }

  /* ── change someone's role, vertical or active flag ── */
  if (action === "update-staff") {
    const { userId, ...rest } = raw as { userId?: string };
    if (!userId) return fail(422, "userId is required.");

    const parsed = staffSchema.partial().safeParse(rest);
    if (!parsed.success) return zodFail(parsed.error as ZodError);
    const input = parsed.data;

    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, vertical: true, active: true },
    });
    if (!before) return fail(404, "Account not found.");

    // Don't let the last active super admin lock everyone out.
    if (
      before.role === "SUPER_ADMIN" &&
      (input.role !== undefined && input.role !== "SUPER_ADMIN" || input.active === false)
    ) {
      const others = await prisma.user.count({
        where: { role: "SUPER_ADMIN", active: true, id: { not: userId } },
      });
      if (others === 0) {
        return fail(409, "This is the only active super admin — promote someone else first.");
      }
    }

    // Promoting somebody to judge/mentor has to leave them with a reachable
    // portal, so resolve the roster row before the role actually changes.
    const nextRole = input.role ?? before.role;
    const nextEmail = input.email ?? before.email;
    const link = await findPanelLink(userId, nextRole, nextEmail, input.panelMemberId);
    if (link && "error" in link) return fail(422, link.error);

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.vertical !== undefined
            ? { vertical: input.role === "TEAM_LEAD" || !input.role ? input.vertical : null }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
        },
        select: { id: true, email: true, role: true, vertical: true, active: true },
      });

      if (link && "memberId" in link) {
        await tx.panelMember.update({ where: { id: link.memberId }, data: { userId } });
      }
      // Stepping down off the panel must not leave a stale link behind: the
      // next person promoted into that seat would find it already taken.
      if (before.role === "JUDGE" || before.role === "MENTOR") {
        if (nextRole !== "JUDGE" && nextRole !== "MENTOR") {
          await tx.panelMember.updateMany({ where: { userId }, data: { userId: null } });
        }
      }
      if (input.volunteerId !== undefined && input.volunteerId !== null) {
        await tx.volunteer.update({ where: { id: input.volunteerId }, data: { userId } });
      }
      return updated;
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "user.update",
      entityType: "user",
      entityId: userId,
      before: { role: before.role, vertical: before.vertical, active: before.active },
      after: {
        role: user.role,
        vertical: user.vertical,
        active: user.active,
        panelLinked: Boolean(link && "memberId" in link),
      },
    });

    return NextResponse.json({ ok: true, user });
  }

  return fail(400, "Unknown action.");
}
