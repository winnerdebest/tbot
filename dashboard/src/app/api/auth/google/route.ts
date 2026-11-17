import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/auth/google/url?redirect_uri=${encodeURIComponent(
        redirectUri
      )}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (!res.ok || !data.url) {
      const errUrl = new URL("/login", request.url);
      errUrl.searchParams.set(
        "error",
        data.detail || "Google OAuth is not configured on the backend"
      );
      return NextResponse.redirect(errUrl);
    }

    const response = NextResponse.redirect(data.url);
    if (data.state) {
      response.cookies.set("ani-oauth-state", data.state, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }
    return response;
  } catch (err: any) {
    const errUrl = new URL("/login", request.url);
    errUrl.searchParams.set(
      "error",
      `Failed to connect to backend: ${err?.message || "unknown error"}`
    );
    return NextResponse.redirect(errUrl);
  }
}
