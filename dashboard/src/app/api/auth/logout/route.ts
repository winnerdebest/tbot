import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST() {
  try {
    await fetch(`${BACKEND_URL}/api/auth/logout`, { method: "POST" });
  } catch {
    // ignore backend error on logout
  }
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("ani-auth", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return response;
}
