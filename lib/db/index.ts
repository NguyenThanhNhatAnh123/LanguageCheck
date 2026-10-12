import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "@/lib/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

// Kept on globalThis so dev hot reload does not open a new connection each time.
const globalForDb = globalThis as typeof globalThis & { __podQaDb?: Db };

function createDb(): Db {
  const file = path.resolve(getDatabasePath());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  return drizzle({ client: sqlite, schema });
}

/** Opens the database lazily. Callers in prerenderable code must `await connection()` first. */
export function getDb(): Db {
  globalForDb.__podQaDb ??= createDb();
  return globalForDb.__podQaDb;
}
