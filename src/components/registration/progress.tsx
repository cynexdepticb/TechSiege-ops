"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Progress({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Registration progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  done || active ? "bg-primary" : "bg-muted",
                )}
              />
              <p
                className={cn(
                  "mt-1.5 truncate text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? <Check className="mr-1 inline size-3" /> : null}
                {label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
