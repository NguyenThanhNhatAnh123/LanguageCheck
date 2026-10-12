import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { addDictionaryWord, listDictionaryEntries, loadDictionaryMatcher } from "./repository";

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
    expect(addDictionaryWord({ language: "en-US", word: "Haida" }, db).created).toBe(true);
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

describe("loadDictionaryMatcher", () => {
  it("filters by word_key from the database", () => {
    addDictionaryWord({ language: "de-DE", word: "straße" }, db);
    const matcher = loadDictionaryMatcher(db);
    expect(matcher.has("STRASSE", "de-DE")).toBe(true);
    expect(matcher.has("STRASSE", "en-US")).toBe(false);
  });
});
