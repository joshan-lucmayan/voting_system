import { NextRequest, NextResponse } from "next/server";

/**
 * Cookie-presence routing guard only.
 * Role authorization happens server-side in page components
 * (src/app/vote/page.tsx, src/app/admin/page.tsx) and in every API
 * route via requireAuth(). Middleware never performs database lookups.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = !!request.cookies.get("scv_session")?.value;

  // Logged-in users do not need the auth pages.
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/vote", request.url));
  }

  if (pathname.startsWith("/vote") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/vote/:path*", "/login", "/signup", "/admin", "/admin/:path*"],
};
