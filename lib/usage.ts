import { asc, desc, like, sql } from "drizzle-orm";
import type { TokenUsage } from "@/lib/claude/transport";
import { getDb, type Db } from "@/lib/db";
import { usageDaily } from "@/lib/db/schema";

/** YYYY-MM-DD in the server's local time zone. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adds one analyzed image and its tokens to today's row for that model. The four token
 * counts are kept apart because each is billed at its own rate. Numbers only, never content.
 */
export function recordUsage(model: string, usage: TokenUsage, db: Db = getDb(), now: Date = new Date()): void {
  db.insert(usageDaily)
    .values({
      date: localDateKey(now),
      model,
      images: 1,
      inputTokens: usage.inputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      cacheWriteTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
    })
    .onConflictDoUpdate({
      target: [usageDaily.date, usageDaily.model],
      set: {
        images: sql`${usageDaily.images} + 1`,
        inputTokens: sql`${usageDaily.inputTokens} + ${usage.inputTokens}`,
        cacheReadTokens: sql`${usageDaily.cacheReadTokens} + ${usage.cacheReadInputTokens}`,
        cacheWriteTokens: sql`${usageDaily.cacheWriteTokens} + ${usage.cacheCreationInputTokens}`,
        outputTokens: sql`${usageDaily.outputTokens} + ${usage.outputTokens}`,
      },
    })
    .run();
}

export type UsageRow = typeof usageDaily.$inferSelect;

/** One row per day and model, most recent day first. `days` limits how far back. */
export function listUsageDays(days = 62, db: Db = getDb(), now: Date = new Date()): UsageRow[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return db
    .select()
    .from(usageDaily)
    .where(sql`${usageDaily.date} >= ${localDateKey(from)}`)
    .orderBy(desc(usageDaily.date), asc(usageDaily.model))
    .all();
}

export interface UsageTotals {
  images: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface ModelUsageTotals extends UsageTotals {
  model: string;
}

const sumColumns = {
  images: sql<number>`coalesce(sum(${usageDaily.images}), 0)`,
  inputTokens: sql<number>`coalesce(sum(${usageDaily.inputTokens}), 0)`,
  cacheReadTokens: sql<number>`coalesce(sum(${usageDaily.cacheReadTokens}), 0)`,
  cacheWriteTokens: sql<number>`coalesce(sum(${usageDaily.cacheWriteTokens}), 0)`,
  outputTokens: sql<number>`coalesce(sum(${usageDaily.outputTokens}), 0)`,
};

/** Per-model totals for the calendar month containing `now` (server local time). */
export function monthUsageByModel(now: Date = new Date(), db: Db = getDb()): ModelUsageTotals[] {
  const prefix = localDateKey(now).slice(0, 7); // YYYY-MM
  return db
    .select({ model: usageDaily.model, ...sumColumns })
    .from(usageDaily)
    .where(like(usageDaily.date, `${prefix}-%`))
    .groupBy(usageDaily.model)
    .orderBy(asc(usageDaily.model))
    .all();
}

export function sumUsage(rows: readonly UsageTotals[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (total, row) => ({
      images: total.images + row.images,
      inputTokens: total.inputTokens + row.inputTokens,
      cacheReadTokens: total.cacheReadTokens + row.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + row.cacheWriteTokens,
      outputTokens: total.outputTokens + row.outputTokens,
    }),
    { images: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
  );
}

/** All input tokens: uncached + cache reads + cache writes. */
export function totalInputTokens(row: UsageTotals): number {
  return row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
}

/** Share of input tokens served from the cache, or null when there was no input. */
export function cacheHitRate(row: UsageTotals): number | null {
  const input = totalInputTokens(row);
  return input === 0 ? null : row.cacheReadTokens / input;
}

/** All tokens (input of every kind + output) per image, or null with no images. */
export function tokensPerImage(row: UsageTotals): number | null {
  return row.images === 0 ? null : (totalInputTokens(row) + row.outputTokens) / row.images;
}
