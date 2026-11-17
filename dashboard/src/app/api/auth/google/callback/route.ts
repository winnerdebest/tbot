import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

  if (error || !code) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "error",
      error || "Google sign-in was cancelled or did not return a code."
    );
    return NextResponse.redirect(loginUrl);
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/auth/google/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set(
        "error",
        data.detail || "Google authentication failed."
      );
      return NextResponse.redirect(loginUrl);
    }

    const needsOnboarding =
      data.is_new_user ||
      (!data.user?.onboarding_completed && !data.agent?.has_groq_key);

    const destUrl = new URL(needsOnboarding ? "/onboarding" : "/", request.url);
    const response = NextResponse.redirect(destUrl);

    response.cookies.set("ani-auth", data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 14,
      path: "/",
    });
    response.cookies.delete("ani-oauth-state");
    return response;
  } catch (err: any) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "error",
      `Authentication error: ${err?.message || "network error"}`
    );
    return NextResponse.redirect(loginUrl);
  }
}
