"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X, ChevronRight } from "lucide-react";
import { NavIcon } from "@/components/shell/nav-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/primitives";
import { cn, initials } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";
import { signOutAction } from "@/app/actions";

type Props = {
  sections: { group: string; items: NavItem[] }[];
  actor: { name: string; email: string; roleLabel: string; verticalLabel: string | null };
};

export function Sidebar({ sections, actor }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Modules">
      {sections.map((section) => (
        <div key={section.group}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {section.group}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              // /admin/teams/abc should keep "Teams" highlighted.
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <NavIcon name={item.icon} className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {active ? <ChevronRight className="ml-auto size-3.5 opacity-60" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials(actor.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{actor.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {actor.verticalLabel ?? actor.roleLabel}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon-sm" title="Sign out" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile bar — volunteers scan on phones, so the nav must collapse. */}
      <div className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open navigation" className="touch-manipulation">
          <Menu />
        </Button>
        <span className="font-semibold tracking-tight text-foreground">TechSiege Ops</span>
        <Badge variant="muted" className="ml-auto text-xs">
          {actor.roleLabel}
        </Badge>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-semibold tracking-tight">TechSiege Ops</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close navigation" className="touch-manipulation">
                <X />
              </Button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <span className="font-semibold tracking-tight">TechSiege Ops</span>
          <Separator orientation="vertical" className="ml-1 h-4" />
          <span className="text-xs text-muted-foreground">2026</span>
        </div>
        {nav}
        {footer}
        <p className="px-5 pb-4 text-[11px] leading-relaxed text-muted-foreground">
          {actor.verticalLabel ? `${actor.roleLabel} · ${actor.verticalLabel}` : actor.roleLabel}
          <br />
          {actor.email}
        </p>
      </aside>
    </>
  );
}
