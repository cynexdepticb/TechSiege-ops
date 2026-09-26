import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The Postgres schema this app owns.
 *
 * IMPORTANT: the `?schema=` query parameter in DATABASE_URL is a Prisma
 * *engine* convention. The `pg` driver adapter does not read it — it hands the
 * string straight to `pg`, which falls back to `public`. So the schema must be
 * passed explicitly to the adapter, or every query silently hits the wrong
 * schema. Kept here (and in prisma/seed.ts) as the single source of truth.
 */
const SCHEMA = "ops";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Postgres connection string.",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: SCHEMA }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Single pooled client. Next's dev server re-evaluates modules on HMR,
 *  so the instance is cached on globalThis to avoid exhausting connections. */
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
