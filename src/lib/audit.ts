import "server-only";
import { prisma } from "@/lib/prisma";

type Entry = {
  actorId?: string | null;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/** Append-only trail of who changed what. Never throws into the caller's path. */
export async function audit(entry: Entry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? "",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before === undefined ? undefined : JSON.parse(JSON.stringify(entry.before)),
        after: entry.after === undefined ? undefined : JSON.parse(JSON.stringify(entry.after)),
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, e);
  }
}

/** Only the fields that actually differ, to keep the log readable. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const prev = before[key];
    const next = after[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev as T[keyof T];
      a[key] = next as T[keyof T];
    }
  }
  return { before: b, after: a };
}
