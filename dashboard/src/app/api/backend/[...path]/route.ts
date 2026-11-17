import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

async function proxyToBackend(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const search = request.nextUrl.search || "";
  const targetUrl = `${BACKEND_URL}/api/${subPath}${search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const authCookie = request.cookies.get("ani-auth")?.value;
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    headers.set("authorization", authHeader);
  } else if (authCookie) {
    headers.set("authorization", `Bearer ${authCookie}`);
  }

  let body: BodyInit | undefined = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) body = text;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const data = await upstream.text();
    const res = new NextResponse(data, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
      },
    });

    // If login, register, or Google OAuth returned a new session token, store it in the httpOnly cookie
    if (
      upstream.ok &&
      (subPath === "auth/login" ||
        subPath === "auth/register" ||
        subPath === "auth/google/exchange" ||
        subPath === "auth/google/id-token")
    ) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.token) {
          res.cookies.set("ani-auth", parsed.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 14,
            path: "/",
          });
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (subPath === "auth/logout") {
      res.cookies.set("ani-auth", "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${err?.message || "connection error"}` },
      { status: 502 }
    );
  }
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const DELETE = proxyToBackend;
export const PATCH = proxyToBackend;
