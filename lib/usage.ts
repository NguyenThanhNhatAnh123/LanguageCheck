import { desc, like, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { usageDaily } from "@/lib/db/schema";
import type { TokenUsage } from "@/lib/claude/transport";

/** YYYY-MM-DD in the server's local time zone. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adds one analyzed image and its tokens to today's row. input_tokens counts every input
 * token Claude processed (uncached + cache writes + cache reads); usage_daily has no
 * separate cache columns. Numbers only, never content.
 */
export function recordUsage(usage: TokenUsage, db: Db = getDb(), now: Date = new Date()): void {
  const inputTokens = usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
  db.insert(usageDaily)
    .values({ date: localDateKey(now), images: 1, inputTokens, outputTokens: usage.outputTokens })
    .onConflictDoUpdate({
      target: usageDaily.date,
      set: {
        images: sql`${usageDaily.images} + 1`,
        inputTokens: sql`${usageDaily.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${usageDaily.outputTokens} + ${usage.outputTokens}`,
      },
    })
    .run();
}

export type UsageDay = typeof usageDaily.$inferSelect;

/** Most recent days first. */
export function listUsageDays(limit = 90, db: Db = getDb()): UsageDay[] {
  return db.select().from(usageDaily).orderBy(desc(usageDaily.date)).limit(limit).all();
}

export interface UsageTotals {
  days: number;
  images: number;
  inputTokens: number;
  outputTokens: number;
}

/** Totals for the calendar month containing `now` (server local time). */
export function monthTotals(now: Date = new Date(), db: Db = getDb()): UsageTotals {
  const prefix = localDateKey(now).slice(0, 7); // YYYY-MM
  const row = db
    .select({
      days: sql<number>`count(*)`,
      images: sql<number>`coalesce(sum(${usageDaily.images}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${usageDaily.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${usageDaily.outputTokens}), 0)`,
    })
    .from(usageDaily)
    .where(like(usageDaily.date, `${prefix}-%`))
    .get();
  return row ?? { days: 0, images: 0, inputTokens: 0, outputTokens: 0 };
}
