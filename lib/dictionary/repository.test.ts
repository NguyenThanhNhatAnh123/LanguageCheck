import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { addDictionaryWord, deleteDictionaryWord, importDictionaryWords, listDictionaryEntries, loadDictionaryMatcher } from "./repository";

let db: Db;

beforeEach(() => {
  // Fresh in-memory database built from the real migrations.
  db = drizzle({ client: new Database(":memory:"), schema });
  migrate(db, { migrationsFolder: path.resolve("drizzle") });
});

describe("addDictionaryWord", () => {
  it("rejects FÜR after für as a duplicate (de-DE)", () => {
    expect(addDictionaryWord({ language: "de-DE", word: "für" }, db).created).toBe(true);
    const second = addDictionaryWord({ language: "de-DE", word: "FÜR" }, db);
    expect(second.created).toBe(false);
    expect(second.entry.word).toBe("für");
    expect(listDictionaryEntries(db)).toHaveLength(1);
  });

  it("rejects straße after STRASSE as a duplicate (de-DE)", () => {
    expect(addDictionaryWord({ language: "de-DE", word: "STRASSE" }, db).created).toBe(true);
    expect(addDictionaryWord({ language: "de-DE", word: "straße" }, db).created).toBe(false);
    expect(listDictionaryEntries(db)).toHaveLength(1);
  });

  it("allows the same word in another language", () => {
    expect(addDictionaryWord({ language: "es-ES", word: "Haida" }, db).created).toBe(true);
    expect(addDictionaryWord({ language: "de-DE", word: "Haida" }, db).created).toBe(true);
    expect(listDictionaryEntries(db)).toHaveLength(2);
  });

  it("stores the word as typed and the computed key", () => {
    const { entry } = addDictionaryWord({ language: "de-DE", word: "Straße", note: "tên đường" }, db);
    expect(entry).toMatchObject({ word: "Straße", wordKey: "strasse", note: "tên đường" });
  });

  it("enforces uniqueness in the database itself", () => {
    db.insert(schema.dictionary).values({ language: "de-DE", word: "für", wordKey: "für" }).run();
    expect(() =>
      db.insert(schema.dictionary).values({ language: "de-DE", word: "FÜR", wordKey: "für" }).run(),
    ).toThrow(/UNIQUE/);
  });
});

describe("deleteDictionaryWord", () => {
  it("deletes by id and reports whether something was deleted", () => {
    const { entry } = addDictionaryWord({ language: "es-ES", word: "Haida" }, db);
    expect(deleteDictionaryWord(entry.id, db)).toBe(true);
    expect(deleteDictionaryWord(entry.id, db)).toBe(false);
    expect(listDictionaryEntries(db)).toEqual([]);
  });
});

describe("importDictionaryWords", () => {
  it("adds new words and skips ones already present (by word_key)", () => {
    addDictionaryWord({ language: "de-DE", word: "Straße" }, db);
    const summary = importDictionaryWords(
      [
        { language: "de-DE", word: "STRASSE" },
        { language: "es-ES", word: "Haida", note: "tribe" },
        { language: "es-ES", word: "HAIDA" },
        { language: "fr-FR", word: "Été" },
      ],
      db,
    );
    expect(summary).toEqual({ created: 2, existing: 2 });
    expect(listDictionaryEntries(db).map((entry) => `${entry.language}:${entry.word}`)).toEqual([
      "de-DE:Straße",
      "es-ES:Haida",
      "fr-FR:Été",
    ]);
  });
});

describe("loadDictionaryMatcher", () => {
  it("filters by word_key from the database", () => {
    addDictionaryWord({ language: "de-DE", word: "straße" }, db);
    const matcher = loadDictionaryMatcher(db);
    expect(matcher.has("STRASSE", "de-DE")).toBe(true);
    expect(matcher.has("STRASSE", "es-ES")).toBe(false);
  });
});
