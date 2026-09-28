import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { SITE } from "@/lib/site";

/**
 * Shell for the judge and mentor portals. Deliberately simpler than the admin
 * sidebar: these users get exactly one page, so a full nav would be noise.
 */
export function PortalShell({
  name,
  email,
  roleLabel,
  children,
}: {
  name: string;
  email: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {roleLabel} · {email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground"
            >
              {SITE.name}
            </Link>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="size-4" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl">{children}</main>
    </div>
  );
}
