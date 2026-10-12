import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Security guard: every API route checks the session itself (CLAUDE.md "Đăng nhập"), so a
// proxy bypass or a missing matcher can never expose data. New routes must call
// hasValidSession() or be added below with a reason.
const PUBLIC_ROUTES: Record<string, string> = {
  "auth/login/route.ts": "the login endpoint itself (rate-limited per IP)",
  "auth/logout/route.ts": "only clears the cookie; harmless without a session",
};

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const apiDir = path.resolve("app/api");
const routes = routeFiles(apiDir).map((file) => ({
  file,
  relative: path.relative(apiDir, file).split(path.sep).join("/"),
}));

describe("API routes", () => {
  it("are found", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  for (const route of routes) {
    if (PUBLIC_ROUTES[route.relative]) continue;
    it(`${route.relative} checks the session in every handler`, () => {
      const source = fs.readFileSync(route.file, "utf8");
      const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].length;
      const checks = [...source.matchAll(/if \(!\(await hasValidSession\(\)\)\) return unauthorizedResponse\(\);/g)].length;
      expect(handlers).toBeGreaterThan(0);
      expect(checks).toBe(handlers);
    });
  }

  it("lists only routes that still exist as public", () => {
    for (const relative of Object.keys(PUBLIC_ROUTES)) {
      expect(routes.some((route) => route.relative === relative), relative).toBe(true);
    }
  });
});
