import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { localDateKey, recordUsage } from "./usage";

let db: Db;

beforeEach(() => {
  db = drizzle({ client: new Database(":memory:"), schema });
  migrate(db, { migrationsFolder: path.resolve("drizzle") });
});

const usage = { inputTokens: 100, outputTokens: 40, cacheCreationInputTokens: 20, cacheReadInputTokens: 300 };

describe("recordUsage", () => {
  it("adds images and tokens to the day's row", () => {
    const day = new Date(2026, 9, 12, 10, 0);
    recordUsage(usage, db, day);
    recordUsage(usage, db, day);
    expect(db.select().from(schema.usageDaily).all()).toEqual([
      // input = uncached + cache writes + cache reads
      { date: "2026-10-12", images: 2, inputTokens: 840, outputTokens: 80 },
    ]);
  });

  it("starts a new row on a new local day", () => {
    recordUsage(usage, db, new Date(2026, 9, 12, 23, 59));
    recordUsage(usage, db, new Date(2026, 9, 13, 0, 1));
    expect(db.select().from(schema.usageDaily).all().map((row) => row.date)).toEqual(["2026-10-12", "2026-10-13"]);
  });
});

describe("localDateKey", () => {
  it("pads month and day", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
