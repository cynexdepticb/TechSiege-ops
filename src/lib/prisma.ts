import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

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

// Create fresh client instance with latest Prisma schema
export const prisma = createClient();
