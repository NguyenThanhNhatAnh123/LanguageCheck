import { createHash, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { getAuthEnv } from "@/lib/env";

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const { APP_USERNAME, APP_PASSWORD_HASH_B64 } = getAuthEnv();
  const passwordHash = decodePasswordHash(APP_PASSWORD_HASH_B64);
  // Always run bcrypt so a wrong username takes as long as a wrong password.
  const usernameOk = constantTimeEqual(username, APP_USERNAME);
  const passwordOk = await compare(password, passwordHash);
  return usernameOk && passwordOk;
}

/**
 * Throws (naming keys, never values) unless the login settings are usable. Called at
 * production startup so a bad .env.local stops the server instead of breaking every login.
 */
export function assertAuthConfig(): void {
  decodePasswordHash(getAuthEnv().APP_PASSWORD_HASH_B64);
}

export function decodePasswordHash(base64: string): string {
  // Stored base64-encoded because Next.js expands `$` in .env files, which breaks raw bcrypt hashes.
  const passwordHash = Buffer.from(base64, "base64").toString("utf8");
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    throw new Error("APP_PASSWORD_HASH_B64 is not a base64-encoded bcrypt hash (generate it with npm run hash-password)");
  }
  return passwordHash;
}

function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
