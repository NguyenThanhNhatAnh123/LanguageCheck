export const LANGUAGES = ["en-US", "de-DE", "fr-FR", "es-ES"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  "en-US": "Tiếng Anh (Mỹ)",
  "de-DE": "Tiếng Đức",
  "fr-FR": "Tiếng Pháp",
  "es-ES": "Tiếng Tây Ban Nha",
};
