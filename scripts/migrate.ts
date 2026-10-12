// Applies pending migrations from ./drizzle to DATABASE_PATH.
// Usage: npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabasePath } from "../lib/env";

loadEnvConfig(process.cwd());

const file = path.resolve(getDatabasePath());
fs.mkdirSync(path.dirname(file), { recursive: true });

const sqlite = new Database(file);
try {
  migrate(drizzle({ client: sqlite }), { migrationsFolder: path.resolve("drizzle") });
  console.log(`Migrations applied: ${file}`);
} finally {
  sqlite.close();
}
