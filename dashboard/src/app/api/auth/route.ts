import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correctPassword = process.env.DASHBOARD_PASSWORD || "admin";

  if (password === correctPassword) {
    const response = NextResponse.json({ status: "ok" });
    response.cookies.set("ani-auth", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;
  }

  return NextResponse.json({ status: "error", detail: "Invalid password" }, { status: 401 });
}
