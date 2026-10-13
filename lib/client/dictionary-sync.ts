import type { DictionaryKeyEntry } from "@/lib/dictionary/matcher";
import { isLanguage } from "@/lib/languages";

// How the session keeps results in step with the team dictionary (CLAUDE.md "Thẻ mockup lỗi"):
// - every finished result remembers the dictionary words that have filtered it;
// - re-filtering uses those words plus the current dictionary, so a word someone deletes
//   (on /dictionary, or from another machine) does not bring old errors back on results
//   already shown; images checked afterwards use the current dictionary only;
// - the one exception is "Hoàn tác" right after adding a word from a card, which forgets that
//   word everywhere, so its errors come back.

/** "de-DE|haida": one dictionary word, as a set member. */
export type DictionaryKey = string;

export function dictionaryKey(entry: DictionaryKeyEntry): DictionaryKey {
  return `${entry.language}|${entry.wordKey}`;
}

export function dictionaryEntries(keys: Iterable<DictionaryKey>): DictionaryKeyEntry[] {
  const entries: DictionaryKeyEntry[] = [];
  for (const key of keys) {
    const separator = key.indexOf("|");
    const language = key.slice(0, separator);
    if (separator > 0 && isLanguage(language)) entries.push({ language, wordKey: key.slice(separator + 1) });
  }
  return entries;
}

/** Words a finished result is filtered with after a dictionary change. */
export function nextResultKeys(
  previous: ReadonlySet<DictionaryKey>,
  current: Iterable<DictionaryKeyEntry>,
  forget: ReadonlySet<DictionaryKey> = new Set(),
): Set<DictionaryKey> {
  const keys = new Set([...previous].filter((key) => !forget.has(key)));
  for (const entry of current) keys.add(dictionaryKey(entry));
  return keys;
}

/** Reload the dictionary when the tab gets focus again, at most once per 10 seconds. */
export const FOCUS_REFRESH_INTERVAL_MS = 10_000;

export function shouldRefreshOnFocus(lastRefreshAt: number | null, now: number): boolean {
  return lastRefreshAt === null || now - lastRefreshAt >= FOCUS_REFRESH_INTERVAL_MS;
}
