import { redirect } from "next/navigation";
import { requireActor } from "@/lib/guards";
import { canAccessModule, isSuperAdmin } from "@/lib/authz";
import { visibleNav } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { ROLE_LABEL, VERTICAL_LABEL } from "@/lib/authz-lite";
import { getPortalFor } from "@/lib/portals";

/** Admin shell. Every module below /admin is gated here and again per page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  // Judges and mentors get their own portal, not the admin shell.
  const portal = getPortalFor(actor.role);
  if (portal) redirect(portal);

  if (actor.role === "VOLUNTEER") redirect("/checkin");

  const sections = visibleNav([actor.role]).filter((s) =>
    s.items.every((item) => !item.module || canAccessModule(actor, item.module)),
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        sections={sections}
        actor={{
          name: actor.name,
          email: actor.email,
          roleLabel: ROLE_LABEL[actor.role],
          verticalLabel: actor.vertical && !isSuperAdmin(actor) ? VERTICAL_LABEL[actor.vertical] : null,
        }}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
