import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getActor, ForbiddenError } from "@/lib/guards";
import { canAccessModule, canWrite, type Actor } from "@/lib/authz";

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function zodFail(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    if (!fields[path]) fields[path] = issue.message;
  }
  return NextResponse.json(
    { ok: false, error: "Please fix the highlighted fields.", fields },
    { status: 422 },
  );
}

/**
 * Standard guard for admin route handlers: signed in, module permitted, and
 * (optionally) a write-capable role.
 */
export async function guard(
  module: string,
  mode: "read" | "write" = "read",
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const actor = await getActor();
  if (!actor) return { response: fail(401, "Not signed in.") };
  try {
    const allowed = mode === "write" ? canWrite(actor, module) : canAccessModule(actor, module);
    if (!allowed) return { response: fail(403, "You do not have access to this module.") };
    return { actor };
  } catch (e) {
    if (e instanceof ForbiddenError) return { response: fail(403, e.message) };
    throw e;
  }
}
