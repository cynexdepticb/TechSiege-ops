import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadActor, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/** For server components/pages. Redirects to sign-in when absent. */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await loadActor(session.user.id);
  if (!actor) redirect("/signin");
  return actor;
}

/** For server actions and route handlers. Throws instead of redirecting. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return loadActor(session.user.id);
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this module.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireModule(module: string): Promise<Actor> {
  const { canAccessModule } = await import("@/lib/authz");
  const actor = await getActor();
  if (!actor) redirect("/signin");
  if (!canAccessModule(actor, module)) redirect("/admin");
  return actor;
}

/** Judges and mentors: resolves the PanelMember record tied to their login. */
export async function requirePanelMember(actor: Actor) {
  const member = await prisma.panelMember.findFirst({
    where: { userId: actor.id },
    select: { id: true, kind: true, name: true, email: true },
  });
  if (!member) redirect("/admin");
  return member;
}

/** Wrap a server action so thrown errors become typed results. */
export async function action<T>(
  fn: (actor: Actor) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in." };
    return { ok: true, data: await fn(actor) };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
