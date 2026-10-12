import { sql } from "drizzle-orm";
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
