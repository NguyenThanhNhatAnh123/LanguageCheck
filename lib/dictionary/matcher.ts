import type { Language } from "@/lib/languages";
import { toWordKey } from "./word-key";

export interface DictionaryKeyEntry {
  language: Language;
  wordKey: string;
}

export interface DictionaryMatcher {
  /** True when `word` is in the team dictionary for that language (compared by word_key). */
  has(word: string, language: Language): boolean;
}

// Pure and DB-free so the client can rebuild it after "Thêm vào từ điển" and re-filter results.
export function createDictionaryMatcher(entries: Iterable<DictionaryKeyEntry>): DictionaryMatcher {
  const keysByLanguage = new Map<Language, Set<string>>();
  for (const { language, wordKey } of entries) {
    let keys = keysByLanguage.get(language);
    if (!keys) {
      keys = new Set();
      keysByLanguage.set(language, keys);
    }
    keys.add(wordKey);
  }

  return {
    has: (word, language) => keysByLanguage.get(language)?.has(toWordKey(word, language)) ?? false,
  };
}
