import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
// Relative import: drizzle-kit loads this file outside Next and does not resolve "@/".
import { LANGUAGES } from "../languages";

// The only data kept long-term: the team dictionary and daily usage numbers.
// Never store images or text read from images here.

export const dictionary = sqliteTable(
  "dictionary",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    language: text("language", { enum: LANGUAGES }).notNull(),
    word: text("word").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    // SQLite lower() only folds ASCII; the app must also check duplicates
    // case-insensitively in JS before inserting (e.g. "FÜR" vs "für").
    uniqueIndex("dictionary_language_word_unique").on(table.language, sql`lower(${table.word})`),
  ],
);

export const usageDaily = sqliteTable("usage_daily", {
  // YYYY-MM-DD in server local time.
  date: text("date").primaryKey(),
  images: integer("images").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
});
