import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, registrationsRemainingSafe } from "@/lib/settings-helpers";
import { RegistrationForm } from "@/components/registration/registration-form";
import { Badge } from "@/components/ui/badge";
import { SITE } from "@/lib/site";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Register your team" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [tracks, settings, remaining] = await Promise.all([
    prisma.track.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        capacity: true,
        _count: { select: { teams: true } },
      },
    }),
    getSettings(),
    registrationsRemainingSafe(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Registration open</Badge>
          <Badge variant="muted">
            {remaining > 0 ? `${remaining} team slots left` : "At capacity"}
          </Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Register your team</h1>
        <p className="mt-2 text-muted-foreground">
          {SITE.name} · 30–31 October 2026 · {SITE.venue}. Teams of 2–4, one track each.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Submissions close {formatDateTime(settings.submissionDeadline)}.
        </p>
      </header>

      <RegistrationForm
        tracks={tracks.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          capacity: t.capacity,
          taken: t._count.teams,
        }))}
        registrationOpen={settings.registrationOpen && remaining > 0}
        minMembers={2}
        maxMembers={4}
      />
    </div>
  );
}
