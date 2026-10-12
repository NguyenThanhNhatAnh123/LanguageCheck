import { and, asc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { dictionary } from "@/lib/db/schema";
import type { Language } from "@/lib/languages";
import { createDictionaryMatcher, type DictionaryMatcher } from "./matcher";
import { toWordKey } from "./word-key";

export type DictionaryEntry = typeof dictionary.$inferSelect;

export interface AddDictionaryWordInput {
  language: Language;
  word: string;
  note?: string | null;
}

export interface AddDictionaryWordResult {
  /** false when the same word (by word_key) already exists for that language. */
  created: boolean;
  entry: DictionaryEntry;
}

// `db` is a parameter so tests can pass an in-memory database.

export function listDictionaryEntries(db: Db = getDb()): DictionaryEntry[] {
  return db
    .select()
    .from(dictionary)
    .orderBy(asc(dictionary.language), asc(dictionary.wordKey))
    .all();
}

export function addDictionaryWord(input: AddDictionaryWordInput, db: Db = getDb()): AddDictionaryWordResult {
  const wordKey = toWordKey(input.word, input.language);
  if (!wordKey) throw new Error("Dictionary word must not be empty");

  const inserted = db
    .insert(dictionary)
    .values({ language: input.language, word: input.word, wordKey, note: input.note ?? null })
    .onConflictDoNothing({ target: [dictionary.language, dictionary.wordKey] })
    .returning()
    .get();
  if (inserted) return { created: true, entry: inserted };

  const existing = db
    .select()
    .from(dictionary)
    .where(and(eq(dictionary.language, input.language), eq(dictionary.wordKey, wordKey)))
    .get();
  if (!existing) throw new Error("Dictionary insert conflicted but no existing row was found");
  return { created: false, entry: existing };
}

/** Returns false when no entry has that id. */
export function deleteDictionaryWord(id: number, db: Db = getDb()): boolean {
  return db.delete(dictionary).where(eq(dictionary.id, id)).run().changes > 0;
}

export interface ImportSummary {
  created: number;
  /** Already in the dictionary (same language and word_key): left unchanged. */
  existing: number;
}

/** Adds many words through addDictionaryWord(), in one transaction, never creating duplicates. */
export function importDictionaryWords(inputs: readonly AddDictionaryWordInput[], db: Db = getDb()): ImportSummary {
  // better-sqlite3 transactions are synchronous and cover every statement on the connection.
  const run = db.$client.transaction(() => {
    const summary: ImportSummary = { created: 0, existing: 0 };
    for (const input of inputs) {
      if (addDictionaryWord(input, db).created) summary.created += 1;
      else summary.existing += 1;
    }
    return summary;
  });
  return run();
}

export function loadDictionaryMatcher(db: Db = getDb()): DictionaryMatcher {
  const entries = db
    .select({ language: dictionary.language, wordKey: dictionary.wordKey })
    .from(dictionary)
    .all();
  return createDictionaryMatcher(entries);
}
