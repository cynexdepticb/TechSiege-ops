"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border",
        },
      }}
    />
  );
}
