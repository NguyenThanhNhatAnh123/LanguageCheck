import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { verifyCredentials } from "@/lib/auth/credentials";
import { clearFailures, getAttemptWaitMs, getLockRemainingMs, recordFailure } from "@/lib/auth/login-attempts";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  const lockedMs = getLockRemainingMs(ip);
  if (lockedMs > 0) return lockedResponse(lockedMs);

  // An attempt that comes before the delay of the previous failure is over waits for it, so
  // parallel guesses are slowed down too. The lock may have started meanwhile.
  const waitMs = getAttemptWaitMs(ip);
  if (waitMs > 0) {
    await sleep(waitMs);
    const lockedAfterWait = getLockRemainingMs(ip);
    if (lockedAfterWait > 0) return lockedResponse(lockedAfterWait);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Vui lòng nhập tên đăng nhập và mật khẩu." }, { status: 400 });
  }

  const ok = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!ok) {
    const { lockedForMs, remainingAttempts, delayMs } = recordFailure(ip);
    // Every wrong login is answered later than the previous one (1s, 2s, 4s… max 10s).
    await sleep(delayMs);
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function lockedResponse(remainingMs: number): NextResponse {
  const minutes = Math.ceil(remainingMs / 60_000);
  return NextResponse.json(
    { error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.` },
    { status: 429, headers: { "Retry-After": String(Math.ceil(remainingMs / 1000)) } },
  );
}
