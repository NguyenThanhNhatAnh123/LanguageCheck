import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { UNAUTHORIZED_MESSAGE } from "@/lib/auth/require-session";
import { proxy } from "./proxy";

const origin = "https://qa.eagleglobal2023.com";
const policyPaths = [
  "/uspodsach2d/privacy-policy.html",
  "/uspodsach2d/data-deletion.html",
  "/uspodsach2d/styles.css",
];

function request(urlPath: string, token?: string, method = "GET") {
  return new NextRequest(new URL(urlPath, origin), {
    method,
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined,
  });
}

beforeEach(() => {
  // Test-only settings: never read the deployed server's credentials or environment file.
  vi.stubEnv("APP_USERNAME", "proxy-test-team");
  vi.stubEnv("APP_PASSWORD_HASH_B64", "unused-by-session-tests");
  vi.stubEnv("SESSION_SECRET", "proxy-test-only-session-secret-32-characters");
  vi.stubEnv("SESSION_VERSION", "proxy-test-version");
});

afterEach(() => vi.unstubAllEnvs());

describe("UsPodsach2D public policy documents", () => {
  it.each(policyPaths)("allows signed-out readers to reach %s", async (urlPath) => {
    expect(fs.statSync(path.join("public", urlPath)).isFile()).toBe(true);
    const response = await proxy(request(urlPath));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it.each(policyPaths)("does not require a valid cookie to read %s", async (urlPath) => {
    const response = await proxy(request(`${urlPath}?source=meta`, "invalid-session"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
  });

  it.each(policyPaths.filter((urlPath) => urlPath.endsWith(".html")))(
    "keeps every local link in %s inside the exact public document set",
    (urlPath) => {
      const html = fs.readFileSync(path.join("public", urlPath), "utf8");
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      expect(hrefs.length).toBeGreaterThan(3);
      for (const href of hrefs) {
        if (href.startsWith("mailto:")) continue;
        const target = new URL(href, `${origin}${urlPath}`);
        expect(target.origin).toBe(origin);
        expect(policyPaths).toContain(target.pathname);
      }
    },
  );
});

describe("QA authentication remains enforced", () => {
  it.each([
    "/",
    "/dictionary",
    "/usage",
    "/lt-test",
    "/uspodsach2d",
    "/uspodsach2d/",
    "/uspodsach2d/other.html",
    "/uspodsach2d/privacy-policy.html.bak",
    "/uspodsach2d/privacy-policy.html/extra",
    "/uspodsach2d/data-deletion.html/",
    "/uspodsach2d/styles.css.map",
    "/uspodsach2d/styles.css/private",
    "/other/uspodsach2d/privacy-policy.html",
    "/uspodsach2d/%70rivacy-policy.html",
  ])("redirects a signed-out reader of %s to login", async (urlPath) => {
    const response = await proxy(request(urlPath));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(origin);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(urlPath === "/" ? null : urlPath);
  });

  it("preserves the protected destination and query string", async () => {
    const response = await proxy(request("/dictionary?language=de-DE&page=2"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe(
      "/dictionary?language=de-DE&page=2",
    );
  });

  it.each(["GET", "POST"])("returns 401 for signed-out %s API requests", async (method) => {
    for (const urlPath of [
      "/api/analyze",
      "/api/session",
      "/api/dictionary",
      "/api/uspodsach2d/privacy-policy.html",
    ]) {
      const response = await proxy(request(urlPath, undefined, method));
      expect(response.status, urlPath).toBe(401);
      expect(await response.json()).toEqual({ error: UNAUTHORIZED_MESSAGE });
      expect(response.headers.has("location")).toBe(false);
    }
  });

  it("continues to allow the existing login endpoint", async () => {
    const response = await proxy(request("/api/auth/login", undefined, "POST"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows authenticated dashboard and API requests", async () => {
    const token = await createSessionToken();
    for (const urlPath of ["/", "/dictionary", "/usage", "/api/session", ...policyPaths]) {
      const response = await proxy(request(urlPath, token));
      expect(response.headers.get("x-middleware-next"), urlPath).toBe("1");
      expect(response.headers.has("location"), urlPath).toBe(false);
    }
    const login = await proxy(request("/login", token));
    expect(login.headers.get("location")).toBe(`${origin}/`);
  });

  it("rejects revoked sessions for private routes while leaving documents public", async () => {
    const token = await createSessionToken();
    vi.stubEnv("SESSION_VERSION", "new-test-version");
    expect((await proxy(request("/dictionary", token))).status).toBe(307);
    expect((await proxy(request("/api/session", token))).status).toBe(401);
    expect((await proxy(request(policyPaths[0], token))).headers.get("x-middleware-next")).toBe("1");
  });
});
