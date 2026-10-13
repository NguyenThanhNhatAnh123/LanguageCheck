/** Languages the tool checks: LanguageTool, language rules, team dictionary. */
export const LANGUAGES = ["de-DE", "fr-FR", "es-ES"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  "de-DE": "Tiếng Đức",
  "fr-FR": "Tiếng Pháp",
  "es-ES": "Tiếng Tây Ban Nha",
};

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Languages Claude still recognizes but the tool does not check. Claude transcribes such a
 * block and reports no issues on it; the image goes to Nghi ngờ with a note to check it by hand.
 */
export const UNCHECKED_LANGUAGES = ["en-US"] as const;

export type UncheckedLanguage = (typeof UNCHECKED_LANGUAGES)[number];

export const UNCHECKED_LANGUAGE_LABELS: Record<UncheckedLanguage, string> = {
  "en-US": "Tiếng Anh",
};

export function isUncheckedLanguage(value: string): value is UncheckedLanguage {
  return (UNCHECKED_LANGUAGES as readonly string[]).includes(value);
}
