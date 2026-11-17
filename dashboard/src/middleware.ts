import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes: landing (/welcome), login/register (/login), API proxy/auth, static assets
  if (
    pathname === "/login" ||
    pathname === "/welcome" ||
    pathname === "/icon.svg" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("ani-auth");
  if (!authCookie || !authCookie.value) {
    // Send unauthenticated visitors on "/" to the public landing page (/welcome)
    const targetUrl = new URL(
      pathname === "/" ? "/welcome" : "/login",
      request.url
    );
    return NextResponse.redirect(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
