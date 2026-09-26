"use client";

import { useEffect, useState } from "react";

/**
 * Renders a team's check-in QR on demand. The `qrcode` package is Node-oriented
 * and heavy for the bundle, so it is imported dynamically and only on pages that
 * actually show a code.
 */
export function QrBadge({ value, size = 176 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("qrcode")
      .then((mod) =>
        (mod.default ?? mod).toDataURL(value, {
          width: size * 2,
          margin: 1,
          color: { dark: "#0b0e14", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (failed) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        QR code unavailable — use the link below.
      </p>
    );
  }

  return (
    <div
      className="rounded-lg bg-white p-2"
      style={{ width: size + 16, height: size + 16 }}
    >
      {src ? (
        // Data URL from a locally generated QR — no external request.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Team check-in QR code"
          width={size}
          height={size}
          className="size-full"
        />
      ) : (
        <div className="size-full animate-pulse rounded bg-slate-200" />
      )}
    </div>
  );
}
