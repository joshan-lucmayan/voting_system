import { NextRequest, NextResponse } from "next/server";

const STUDENT_ONLY = ["/vote"];
const ADMIN_ONLY = ["/admin/dashboard", "/admin/elections", "/admin/candidates", "/admin/stats"];
const AUTH_ROUTES = ["/login", "/signup", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get("scv_session")?.value;
  const hasSession = !!sessionCookie;

  // Redirect logged-in users away from auth pages
  if (AUTH_ROUTES.includes(pathname) && hasSession) {
    // If they're on /login or /signup, redirect to /vote
    if (pathname === "/login" || pathname === "/signup") {
      return NextResponse.redirect(new URL("/vote", request.url));
    }
    // If they're on /admin (login page), let them through
    if (pathname === "/admin") {
      return NextResponse.next();
    }
  }

  // Protect student routes
  if (STUDENT_ONLY.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Protect admin routes (but not /admin itself which is the login)
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/vote/:path*",
    "/login",
    "/signup",
    "/admin",
    "/admin/dashboard",
    "/admin/elections",
    "/admin/candidates",
    "/admin/stats",
  ],
};
