import type { Language } from "@/lib/languages";
import type { DictionaryEntry } from "./repository";

/** Dictionary entry as sent to the browser (JSON-safe). */
export interface DictionaryEntryDto {
  id: number;
  language: Language;
  word: string;
  wordKey: string;
  note: string | null;
  createdAt: string;
}

export function toDictionaryEntryDto(entry: DictionaryEntry): DictionaryEntryDto {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}
