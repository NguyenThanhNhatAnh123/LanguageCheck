// Letter-case helpers for matching suggestions to the style of the original text.
// Only cased letters count (letters whose upper and lower forms differ); digits,
// punctuation and caseless scripts are ignored.

function casedLetters(text: string, locale: string | undefined): string[] {
  return Array.from(text).filter(
    (char) => /\p{L}/u.test(char) && char.toLocaleUpperCase(locale) !== char.toLocaleLowerCase(locale),
  );
}

const isUpper = (char: string, locale: string | undefined) => char === char.toLocaleUpperCase(locale);
const isLower = (char: string, locale: string | undefined) => char === char.toLocaleLowerCase(locale);

/** Every cased letter is uppercase (and there is at least one). */
export function isAllCaps(text: string, locale?: string): boolean {
  const letters = casedLetters(text, locale);
  return letters.length > 0 && letters.every((char) => isUpper(char, locale));
}

export type CaseStyle = "upper" | "capitalized" | "lower" | "other";

/**
 * Case style of `original`, per CLAUDE.md "Phương án sửa". A single uppercase letter
 * ("A", "I") is ambiguous, so the surrounding block decides: ALL CAPS block → upper,
 * otherwise capitalized ("A" → "An", not "AN").
 */
export function caseStyleOf(original: string, blockText: string, locale?: string): CaseStyle {
  const letters = casedLetters(original, locale);
  if (letters.length === 0) return "other";
  if (letters.length === 1 && isUpper(letters[0], locale)) {
    return isAllCaps(blockText, locale) ? "upper" : "capitalized";
  }
  if (letters.every((char) => isUpper(char, locale))) return "upper";
  if (letters.every((char) => isLower(char, locale))) return "lower";
  if (isUpper(letters[0], locale) && letters.slice(1).every((char) => isLower(char, locale))) return "capitalized";
  return "other";
}

/** Rewrites `text` in the given style. "other" leaves it unchanged (e.g. "McDonald"). */
export function applyCaseStyle(text: string, style: CaseStyle, locale?: string): string {
  switch (style) {
    case "upper":
      // Locale-aware, so German ß becomes SS.
      return text.toLocaleUpperCase(locale);
    case "lower":
      return text.toLocaleLowerCase(locale);
    case "capitalized": {
      const lower = text.toLocaleLowerCase(locale);
      const chars = Array.from(lower);
      const first = chars.findIndex((char) => char.toLocaleUpperCase(locale) !== char.toLocaleLowerCase(locale));
      if (first === -1) return lower;
      chars[first] = chars[first].toLocaleUpperCase(locale);
      return chars.join("");
    }
    case "other":
      return text;
  }
}

/** Removes diacritics (é → e, Ü → U) via NFD decomposition. */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * True when `candidate` differs from `original` only by accents (and case): same letters
 * once diacritics and case are removed, but not the same string. "ETE" vs "ÉTÉ" → true.
 */
export function differsOnlyByAccents(original: string, candidate: string, locale?: string): boolean {
  const base = (text: string) => stripAccents(text).toLocaleLowerCase(locale);
  return base(original) === base(candidate) && original.toLocaleLowerCase(locale) !== candidate.toLocaleLowerCase(locale);
}

const UMLAUT_SPELLING: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "AE", Ö: "OE", Ü: "UE" };

/**
 * de-DE: true when `original` writes AE/OE/UE where `candidate` has Ä/Ö/Ü, which is a valid
 * German spelling (FUER for FÜR, MUETTER for MÜTTER). "FUR" vs "FÜR" → false: there the
 * umlaut is simply missing.
 */
export function isUmlautSpelledOut(original: string, candidate: string, locale?: string): boolean {
  const nfc = candidate.normalize("NFC");
  if (!/[äöüÄÖÜ]/.test(nfc)) return false;
  const spelledOut = nfc.replace(/[äöüÄÖÜ]/g, (letter) => UMLAUT_SPELLING[letter]);
  return spelledOut.toLocaleLowerCase(locale) === original.normalize("NFC").toLocaleLowerCase(locale);
}

/**
 * es-ES: true when `candidate` only adds a tilde to n (ANO vs AÑO, CUMPLEANOS vs CUMPLEAÑOS).
 * A missing Ñ is always an error: ANO is a real (and very different) word.
 */
export function isMissingEnye(original: string, candidate: string, locale?: string): boolean {
  const nfc = candidate.normalize("NFC");
  if (!/[ñÑ]/.test(nfc) || /[ñÑ]/.test(original.normalize("NFC"))) return false;
  return nfc.replace(/ñ/g, "n").replace(/Ñ/g, "N").toLocaleLowerCase(locale) === original.normalize("NFC").toLocaleLowerCase(locale);
}

/**
 * True when `candidate` differs from `original` only by accents or special characters:
 * diacritics (ANO/AÑO, TU/TÚ, FUR/FÜR), ß for ss, or an added ¿ ¡. Case is ignored.
 */
export function differsOnlyBySpecialCharacters(original: string, candidate: string, locale?: string): boolean {
  const base = (text: string) =>
    stripAccents(text).replace(/ß/g, "ss").replace(/ẞ/g, "SS").replace(/[¿¡]/g, "").toLocaleLowerCase(locale);
  return base(original) === base(candidate) && original.toLocaleLowerCase(locale) !== candidate.toLocaleLowerCase(locale);
}
