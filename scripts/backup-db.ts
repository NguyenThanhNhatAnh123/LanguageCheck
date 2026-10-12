// Online backup of the SQLite database (dictionary + usage numbers), safe while the app is
// running: uses SQLite's backup API, so data still in the WAL file is included, unlike a
// plain file copy. Then checks the copy's integrity.
// Usage: npm run db:backup -- <destination file>
// Output is ASCII on purpose: it is run from PowerShell / Task Scheduler on Windows.
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import Database from "better-sqlite3";
import { getDatabasePath } from "../lib/env";

loadEnvConfig(process.cwd());

function fail(message: string): never {
  console.error(`[backup] ERROR: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const destination = process.argv[2];
  if (!destination) fail("missing destination file. Usage: npm run db:backup -- <file>");

  const source = path.resolve(getDatabasePath());
  if (!fs.existsSync(source)) fail(`database not found: ${source}`);
  const target = path.resolve(destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const db = new Database(source, { fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  // The copy inherits WAL mode from the source; switch it to a rollback journal so a backup
  // is always one self-contained file (no -wal/-shm left next to it).
  const copy = new Database(target, { fileMustExist: true });
  try {
    copy.pragma("journal_mode = DELETE");
    const integrity = copy.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") fail(`integrity check failed for ${target}: ${String(integrity)}`);
    const words = Number(copy.prepare("select count(*) from dictionary").pluck().get());
    const usageRows = Number(copy.prepare("select count(*) from usage_daily").pluck().get());
    console.log(`[backup] OK: ${target} (${words} dictionary words, ${usageRows} usage rows)`);
  } finally {
    copy.close();
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
