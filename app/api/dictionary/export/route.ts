import { connection } from "next/server";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { dictionaryToCsv } from "@/lib/dictionary/csv";
import { listDictionaryEntries } from "@/lib/dictionary/repository";
import { localDateKey } from "@/lib/usage";

export async function GET() {
  await connection();
  if (!(await hasValidSession())) return unauthorizedResponse();
  // BOM so Excel opens the UTF-8 file with accents intact.
  const body = `﻿${dictionaryToCsv(listDictionaryEntries())}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tu-dien-${localDateKey()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
