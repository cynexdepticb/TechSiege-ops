/**
 * Client-side registration funnel tracking.
 *
 * The server records FORM_COMPLETE when a registration is accepted, but the
 * earlier stages only exist if the browser reports them — otherwise the funnel
 * card on the dashboard would always read zero for everything but completions.
 *
 * Every beacon is fire-and-forget: analytics must never block or break the
 * registration form, so failures are swallowed and sends use `keepalive` so
 * they survive the page being unloaded mid-abandonment.
 */

const VISITOR_KEY = "agentx.vid";
const STARTED_KEY = "agentx.started";

export type FunnelEvent =
  | "PAGE_VIEW"
  | "FORM_START"
  | "FORM_STEP"
  | "FORM_ABANDON"
  | "FORM_COMPLETE";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Stable per-browser id so one visitor's stages can be correlated. */
export function visitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Private mode or blocked storage — fall back to a per-tab id.
    return randomId();
  }
}

export function track(type: FunnelEvent, extra: { step?: number; teamId?: string } = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ type, path: "/register", visitorId: visitorId(), ...extra });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics is best-effort */
  }
}

/** True once this browser has shown real intent in the form. */
export function hasStarted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markStarted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STARTED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearStarted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STARTED_KEY);
  } catch {
    /* ignore */
  }
}
