import type { Language } from "@/lib/languages";

/**
 * Key used to compare dictionary words, stored as dictionary.word_key.
 * NFC + lower-case with the language's rules; for de-DE also ß → ss, because ALL-CAPS
 * German writes SS for ß (STRASSE = straße). Computed in code because SQLite's lower()
 * only folds ASCII (it would treat FÜR and für as different words).
 */
export function toWordKey(word: string, language: Language): string {
  const key = word.normalize("NFC").toLocaleLowerCase(language).normalize("NFC");
  return language === "de-DE" ? key.replaceAll("ß", "ss") : key;
}
