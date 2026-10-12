import { hashSync } from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAuthConfig, decodePasswordHash, verifyCredentials } from "./credentials";

const hash = hashSync("correct horse", 4);
const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

function setAuthEnv(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    APP_USERNAME: "team",
    APP_PASSWORD_HASH_B64: b64(hash),
    SESSION_SECRET: "x".repeat(32),
    SESSION_VERSION: "1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("decodePasswordHash", () => {
  it("returns the bcrypt hash", () => {
    expect(decodePasswordHash(b64(hash))).toBe(hash);
  });

  it("rejects a hash pasted without base64, or anything else", () => {
    expect(() => decodePasswordHash(hash)).toThrow(/npm run hash-password/);
    expect(() => decodePasswordHash(b64("$2b$10$tooshort"))).toThrow();
    expect(() => decodePasswordHash("")).toThrow();
  });
});

describe("assertAuthConfig", () => {
  it("passes with a complete configuration", () => {
    setAuthEnv();
    expect(() => assertAuthConfig()).not.toThrow();
  });

  it("names the missing or invalid key, never its value", () => {
    setAuthEnv({ SESSION_SECRET: "short-secret-value" });
    expect(() => assertAuthConfig()).toThrow(/SESSION_SECRET/);
    expect(() => assertAuthConfig()).not.toThrow(/short-secret-value/);
  });

  it("rejects a password hash that is not base64 bcrypt", () => {
    setAuthEnv({ APP_PASSWORD_HASH_B64: hash });
    expect(() => assertAuthConfig()).toThrow(/APP_PASSWORD_HASH_B64/);
  });
});

describe("verifyCredentials", () => {
  it("accepts only the right username and password", async () => {
    setAuthEnv();
    await expect(verifyCredentials("team", "correct horse")).resolves.toBe(true);
    await expect(verifyCredentials("team", "wrong")).resolves.toBe(false);
    await expect(verifyCredentials("other", "correct horse")).resolves.toBe(false);
  });
});
