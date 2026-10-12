import { jwtVerify, SignJWT } from "jose";
import { getAuthEnv } from "@/lib/env";

export const SESSION_COOKIE = "pod_qa_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  const { SESSION_SECRET, SESSION_VERSION } = getAuthEnv();
  return new SignJWT({ ver: SESSION_VERSION })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey(SESSION_SECRET));
}

/** Valid = correct signature, not expired, and issued for the current SESSION_VERSION. */
export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { SESSION_SECRET, SESSION_VERSION } = getAuthEnv();
  try {
    const { payload } = await jwtVerify(token, secretKey(SESSION_SECRET), { algorithms: ["HS256"] });
    return payload.ver === SESSION_VERSION;
  } catch {
    return false;
  }
}
