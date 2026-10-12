import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { verifyCredentials } from "@/lib/auth/credentials";
import { clearFailures, getLockRemainingMs, recordFailure } from "@/lib/auth/login-attempts";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  const lockedMs = getLockRemainingMs(ip);
  if (lockedMs > 0) return lockedResponse(lockedMs);

  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vui lòng nhập tên đăng nhập và mật khẩu." }, { status: 400 });
  }

  const ok = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!ok) {
    const { lockedForMs, remainingAttempts } = recordFailure(ip);
    if (lockedForMs > 0) {
      console.warn("[auth] login locked after repeated failures");
      return lockedResponse(lockedForMs);
    }
    return NextResponse.json(
      { error: `Sai tên đăng nhập hoặc mật khẩu. Còn ${remainingAttempts} lần thử.` },
      { status: 401 },
    );
  }

  clearFailures(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return response;
}

function lockedResponse(remainingMs: number): NextResponse {
  const minutes = Math.ceil(remainingMs / 60_000);
  return NextResponse.json(
    { error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.` },
    { status: 429, headers: { "Retry-After": String(Math.ceil(remainingMs / 1000)) } },
  );
}
