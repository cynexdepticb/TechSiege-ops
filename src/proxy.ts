import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse gate only: bounce anonymous traffic away from the admin shell.
 *
 * Deliberately does NOT decode the JWT or query Prisma. Per the Next 16 Proxy
 * docs, proxy is a network boundary in front of the app that may run
 * separately from render code, so it should not rely on shared modules or
 * globals — and a matcher change can silently drop coverage. Real
 * authorisation (role, vertical, panel scope) therefore lives in
 * `requireActor()` / `requireModule()` in every layout, page and route
 * handler. This layer only needs to know whether a session cookie exists, so
 * an anonymous visitor never pays for a database round trip.
 */

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const PUBLIC_PATHS = [
  "/signin",
  "/register",
  "/api/auth",
  "/api/register",
  "/api/analytics",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js|map)$/.test(pathname)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSession) {
    // API clients want a status code they can branch on, not a login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 },
      );
    }

    const url = new URL("/signin", req.url);
    // Only follow same-origin paths, so ?callbackUrl= can't be used as an
    // open redirect.
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static image files. The trailing
     * `/` makes the match non-empty, and the `*` keeps nested admin routes in.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
