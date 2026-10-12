import { dictionaryWordInputSchema, type DictionaryWordInput } from "./input";

// CSV for dictionary import/export: header "language,word,note", RFC 4180 quoting.
// Pure (no Node APIs) so it can be tested and reused anywhere.

/** Parses CSV text into rows of fields. Handles quotes, escaped quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, ""); // Excel adds a BOM

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((fields) => fields.some((value) => value.trim() !== ""));
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((fields) => fields.map(quote).join(",")).join("\r\n") + "\r\n";
}

export const DICTIONARY_CSV_HEADER = ["language", "word", "note"] as const;

export function dictionaryToCsv(entries: readonly { language: string; word: string; note: string | null }[]): string {
  return toCsv([[...DICTIONARY_CSV_HEADER], ...entries.map((entry) => [entry.language, entry.word, entry.note ?? ""])]);
}

export interface ParsedDictionaryCsv {
  rows: DictionaryWordInput[];
  /** 1-based line numbers of rows that failed validation (unknown language, empty word…). */
  invalidLines: number[];
  /** Set when the file cannot be read as a dictionary CSV at all. */
  error: string | null;
}

/** Validates a dictionary CSV. The header must contain "language" and "word"; "note" is optional. */
export function parseDictionaryCsv(text: string): ParsedDictionaryCsv {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], invalidLines: [], error: "File CSV trống." };

  const columns = header.map((name) => name.trim().toLowerCase());
  const languageIndex = columns.indexOf("language");
  const wordIndex = columns.indexOf("word");
  const noteIndex = columns.indexOf("note");
  if (languageIndex === -1 || wordIndex === -1) {
    return { rows: [], invalidLines: [], error: 'Dòng đầu phải có cột "language" và "word" (cột "note" không bắt buộc).' };
  }

  const rows: DictionaryWordInput[] = [];
  const invalidLines: number[] = [];
  body.forEach((fields, index) => {
    const parsed = dictionaryWordInputSchema.safeParse({
      language: fields[languageIndex]?.trim(),
      word: fields[wordIndex] ?? "",
      note: noteIndex === -1 ? null : (fields[noteIndex] ?? null),
    });
    if (parsed.success) rows.push(parsed.data);
    else invalidLines.push(index + 2); // +1 for the header, +1 for 1-based lines
  });
  return { rows, invalidLines, error: null };
}
