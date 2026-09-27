/**
 * Adds any email template from TEMPLATE_SEEDS that the database does not have yet.
 *
 *   npm run db:sync-templates           report what is missing, change nothing
 *   npm run db:sync-templates -- --apply   insert the missing ones
 *
 * `prisma db seed` cannot be used for this: it creates everything with `create`,
 * not `upsert`, so re-running it collides on the admin account, the settings rows
 * and the seeded tracks. That makes it a one-shot bootstrap, not a way to pick up
 * a new template.
 *
 * Missing-only, never upsert. Templates are editable at /admin/templates, so an
 * organiser's wording is real data. Overwriting it on every deploy would silently
 * undo their edits; a template that already exists is left exactly as it is and
 * reported as "kept".
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { TEMPLATE_SEEDS } from "../src/lib/email/templates";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }, { schema: "ops" }),
});

const apply = process.argv.includes("--apply");

async function main() {
  const existing = await prisma.emailTemplate.findMany({ select: { key: true } });
  const have = new Set(existing.map((t) => t.key));

  const missing = TEMPLATE_SEEDS.filter((t) => !have.has(t.key));
  const kept = TEMPLATE_SEEDS.length - missing.length;

  console.log(`\n  ${kept}/${TEMPLATE_SEEDS.length} template(s) already present.`);

  for (const t of missing) {
    if (apply) {
      await prisma.emailTemplate.create({ data: t });
      console.log(`  + created  ${t.key.padEnd(26)} ${t.name}`);
    } else {
      console.log(`  ? missing  ${t.key.padEnd(26)} ${t.name}`);
    }
  }

  if (missing.length === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  // Also report templates an organiser added themselves, so an unexpected key is
  // visible rather than silently ignored.
  const orphans = [...have].filter((k) => !TEMPLATE_SEEDS.some((t) => t.key === k));
  if (orphans.length) {
    console.log(`\n  Not in TEMPLATE_SEEDS (left alone): ${orphans.join(", ")}`);
  }

  console.log(
    apply
      ? `\n  Inserted ${missing.length} template(s).\n`
      : `\n  Dry run. Re-run with --apply to insert ${missing.length} template(s).\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
