import { createHash, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { getAuthEnv } from "@/lib/env";

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const { APP_USERNAME, APP_PASSWORD_HASH_B64 } = getAuthEnv();
  // Stored base64-encoded because Next.js expands `$` in .env files, which breaks raw bcrypt hashes.
  const passwordHash = Buffer.from(APP_PASSWORD_HASH_B64, "base64").toString("utf8");
  if (!passwordHash.startsWith("$2")) {
    throw new Error("APP_PASSWORD_HASH_B64 is not a base64-encoded bcrypt hash");
  }
  // Always run bcrypt so a wrong username takes as long as a wrong password.
  const usernameOk = constantTimeEqual(username, APP_USERNAME);
  const passwordOk = await compare(password, passwordHash);
  return usernameOk && passwordOk;
}

function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
