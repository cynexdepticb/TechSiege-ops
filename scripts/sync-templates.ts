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
const updateExisting = process.argv.includes("--update");

async function main() {
  const existing = await prisma.emailTemplate.findMany();
  const have = new Map(existing.map((t) => [t.key, t]));

  console.log(`\n  Checking ${TEMPLATE_SEEDS.length} seed templates against database...`);

  for (const t of TEMPLATE_SEEDS) {
    const current = have.get(t.key);
    if (!current) {
      if (apply || updateExisting) {
        await prisma.emailTemplate.create({ data: t });
        console.log(`  + created  ${t.key.padEnd(26)} ${t.name}`);
      } else {
        console.log(`  ? missing  ${t.key.padEnd(26)} ${t.name}`);
      }
    } else {
      if (updateExisting) {
        await prisma.emailTemplate.update({
          where: { key: t.key },
          data: {
            name: t.name,
            type: t.type,
            subject: t.subject,
            body: t.body,
          },
        });
        console.log(`  ✓ updated  ${t.key.padEnd(26)} ${t.name}`);
      } else {
        console.log(`  = present  ${t.key.padEnd(26)} ${t.name}`);
      }
    }
  }

  console.log("\n  Finished sync.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
