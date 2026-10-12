import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  cacheHitRate,
  listUsageDays,
  localDateKey,
  monthUsageByModel,
  recordUsage,
  sumUsage,
  tokensPerImage,
  totalInputTokens,
} from "./usage";

let db: Db;

beforeEach(() => {
  db = drizzle({ client: new Database(":memory:"), schema });
  migrate(db, { migrationsFolder: path.resolve("drizzle") });
});

const usage = { inputTokens: 100, outputTokens: 40, cacheCreationInputTokens: 20, cacheReadInputTokens: 300 };
const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";

describe("recordUsage", () => {
  it("adds images and the four token counts to the day's row for that model", () => {
    const day = new Date(2026, 9, 12, 10, 0);
    recordUsage(SONNET, usage, db, day);
    recordUsage(SONNET, usage, db, day);
    recordUsage(HAIKU, usage, db, day);
    expect(db.select().from(schema.usageDaily).all()).toEqual([
      { date: "2026-10-12", model: SONNET, images: 2, inputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 40, outputTokens: 80 },
      { date: "2026-10-12", model: HAIKU, images: 1, inputTokens: 100, cacheReadTokens: 300, cacheWriteTokens: 20, outputTokens: 40 },
    ]);
  });

  it("starts a new row on a new local day", () => {
    recordUsage(SONNET, usage, db, new Date(2026, 9, 12, 23, 59));
    recordUsage(SONNET, usage, db, new Date(2026, 9, 13, 0, 1));
    expect(db.select().from(schema.usageDaily).all().map((row) => row.date)).toEqual(["2026-10-12", "2026-10-13"]);
  });
});

describe("listUsageDays and monthUsageByModel", () => {
  beforeEach(() => {
    recordUsage(SONNET, usage, db, new Date(2026, 8, 30, 12)); // September
    recordUsage(SONNET, usage, db, new Date(2026, 9, 1, 12));
    recordUsage(HAIKU, usage, db, new Date(2026, 9, 12, 12));
    recordUsage(SONNET, usage, db, new Date(2026, 9, 12, 13));
    recordUsage(SONNET, usage, db, new Date(2026, 9, 12, 14));
  });

  it("lists recent days first, models alphabetically, within the window", () => {
    const now = new Date(2026, 9, 12);
    expect(listUsageDays(62, db, now).map((row) => `${row.date}/${row.model}`)).toEqual([
      "2026-10-12/claude-haiku-5-5",
      "2026-10-12/claude-sonnet-5-5",
      "2026-10-01/claude-sonnet-5-5",
      "2026-09-30/claude-sonnet-5-5",
    ]);
    expect(listUsageDays(12, db, now).map((row) => row.date)).toEqual(["2026-10-12", "2026-10-12", "2026-10-01"]);
  });

  it("sums the current month per model", () => {
    expect(monthUsageByModel(new Date(2026, 9, 20), db)).toEqual([
      { model: HAIKU, images: 1, inputTokens: 100, cacheReadTokens: 300, cacheWriteTokens: 20, outputTokens: 40 },
      { model: SONNET, images: 3, inputTokens: 300, cacheReadTokens: 900, cacheWriteTokens: 60, outputTokens: 120 },
    ]);
    expect(monthUsageByModel(new Date(2026, 6, 1), db)).toEqual([]);
  });
});

describe("derived numbers", () => {
  const row = { images: 2, inputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 200, outputTokens: 100 };

  it("totals input, cache hit rate and tokens per image", () => {
    expect(totalInputTokens(row)).toBe(1000);
    expect(cacheHitRate(row)).toBe(0.6);
    expect(tokensPerImage(row)).toBe(550);
  });

  it("has no rate without input or images", () => {
    const empty = sumUsage([]);
    expect(cacheHitRate(empty)).toBeNull();
    expect(tokensPerImage(empty)).toBeNull();
  });

  it("sums rows", () => {
    expect(sumUsage([row, row]).cacheReadTokens).toBe(1200);
  });
});

describe("localDateKey", () => {
  it("pads month and day", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
