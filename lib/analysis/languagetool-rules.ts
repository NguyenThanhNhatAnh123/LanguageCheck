import type { ClaudeBlock, Severity } from "@/lib/claude/schema";
import { toWordKey } from "@/lib/dictionary/word-key";
import type { Language } from "@/lib/languages";
import { LANGUAGES } from "@/lib/languages";
import { differsOnlyByAccents, isAllCaps, isMissingEnye, isUmlautSpelledOut, stripAccents } from "./text-case";
import type { LtBlockMatch } from "./types";

// ---------------------------------------------------------------------------
// Grouping blocks per language and mapping LanguageTool offsets back to blocks.
// ---------------------------------------------------------------------------

export interface LanguageGroup {
  language: Language;
  /** Block texts joined with "\n", sent to LanguageTool as one request. */
  text: string;
  /** Where each block starts inside `text`. */
  segments: Array<{ blockIndex: number; start: number; end: number }>;
}

/**
 * The text LanguageTool checks for a block: Claude's `normal_case` version when it differs
 * from the transcription by letter case only (same length and same letters, so offsets map
 * 1:1), otherwise the transcription itself. LanguageTool misses most agreement errors in ALL
 * CAPS text (MEINE HUND, PARFAIT, ORGULLOSO) and catches them in normal case.
 */
export function languageToolText(block: ClaudeBlock, language: Language): string {
  const normal = block.normal_case;
  if (normal === null || normal === block.text || normal.length !== block.text.length) return block.text;
  // Same letters at every position, ignoring case; any whitespace matches any whitespace
  // (Claude sometimes joins the lines with spaces, which keeps the offsets).
  const shape = (text: string) => text.toLocaleLowerCase(language).replace(/\s/g, " ");
  return shape(normal) === shape(block.text) && normal.toLocaleLowerCase(language).length === normal.length ? normal : block.text;
}

/** One group per language present; "unknown" and English blocks are skipped (Claude only). */
export function groupBlocksByLanguage(blocks: readonly ClaudeBlock[]): LanguageGroup[] {
  return LANGUAGES.flatMap((language) => {
    const members = blocks.filter((block) => block.language === language && block.text.length > 0);
    if (members.length === 0) return [];
    const segments: LanguageGroup["segments"] = [];
    let cursor = 0;
    for (const block of members) {
      segments.push({ blockIndex: block.index, start: cursor, end: cursor + block.text.length });
      cursor += block.text.length + 1; // "\n" separator
    }
    return [{ language, text: members.map((block) => languageToolText(block, language)).join("\n"), segments }];
  });
}

export interface RawLtMatch {
  offset: number;
  length: number;
  message: string;
  replacements: Array<{ value: string }>;
  rule: { id: string; issueType?: string; category?: { id: string } };
}

/**
 * Maps a LanguageTool match (offsets in the joined group text) onto the block it starts in.
 * A match running past the end of its block (across the "\n" separator) is clipped.
 */
export function mapMatchToBlock(group: LanguageGroup, match: RawLtMatch): LtBlockMatch | null {
  const segment = group.segments.find((seg) => match.offset >= seg.start && match.offset < seg.end);
  if (!segment) return null;
  const start = match.offset - segment.start;
  const end = Math.min(match.offset + match.length, segment.end) - segment.start;
  if (end <= start) return null;
  return {
    blockIndex: segment.blockIndex,
    start,
    end,
    message: match.message,
    issueType: match.rule.issueType ?? null,
    ruleId: match.rule.id,
    categoryId: match.rule.category?.id ?? null,
    replacements: match.replacements.map((replacement) => replacement.value),
  };
}

// ---------------------------------------------------------------------------
// Severity mapping and Vietnamese labels (CLAUDE.md "Quy đổi severity LanguageTool").
// ---------------------------------------------------------------------------

export function ltSeverity(issueType: string | null): Severity {
  switch (issueType) {
    case "misspelling":
    case "grammar":
    case "duplication":
      return "error";
    case "typographical":
    case "style":
    case "whitespace":
      return "info";
    default:
      return "warning";
  }
}

export function ltLabelVi(issueType: string | null): string {
  switch (issueType) {
    case "misspelling":
      return "Lỗi chính tả";
    case "grammar":
      return "Lỗi ngữ pháp";
    case "duplication":
      return "Lặp từ";
    case "typographical":
      return "Lỗi dấu câu/trình bày";
    default:
      return "Cần xem lại";
  }
}

// ---------------------------------------------------------------------------
// Language rules for LanguageTool matches (CLAUDE.md "Quy tắc ngôn ngữ"). They take
// precedence over the severity table. The fr-FR "ALL CAPS missing accent" rule runs later,
// after merging (see pipeline.ts), because it looks at Claude's suggestions too.
// ---------------------------------------------------------------------------

/** es-ES pairs where the accent changes the meaning (TU/TÚ, SI/SÍ, EL/ÉL, MAS/MÁS). */
const ES_MEANING_ACCENT_WORDS = new Set(["tu", "si", "el", "mas"]);

export type LtRuleOutcome = { action: "drop" } | { action: "keep"; severity: Severity };

/** Comma rules (de KOMMA…, fr VIRG…/VIRGULE, es COMA, generic COMMA) in rule or category ids. */
const COMMA_RULE = /KOMMA|COMMA|VIRG|(^|_)COMA(_|$)/;

/**
 * A missing-comma match: a suggestion that only adds commas (" j'" → ", j'"), or a comma rule
 * without suggestions (KOMMA_ZWISCHEN_HAUPT_UND_NEBENSATZ just says "insert a comma here").
 */
function isMissingCommaMatch(match: LtBlockMatch, original: string): boolean {
  // Case-insensitive: LanguageTool may have checked the normal-case copy of an ALL CAPS block.
  const withoutCommas = (text: string) => text.replace(/[,\s]/g, "").toLowerCase();
  const commas = (text: string) => (text.match(/,/g) ?? []).length;
  if (match.replacements.some((r) => withoutCommas(r) === withoutCommas(original) && commas(r) > commas(original))) return true;
  return match.replacements.length === 0 && (COMMA_RULE.test(match.ruleId) || COMMA_RULE.test(match.categoryId ?? ""));
}

export function applyLtLanguageRules(match: LtBlockMatch, block: ClaudeBlock, language: Language): LtRuleOutcome {
  const original = block.text.slice(match.start, match.end);
  const severity = ltSeverity(match.issueType);

  // "[?]" marks a letter Claude could not read; that uncertainty is Claude's ocr_uncertain
  // issue, so LanguageTool's opinion on the placeholder is noise.
  if (original.includes("[?]")) return { action: "drop" };

  // Short slogans usually have no commas (the prompt tells Claude the same). LanguageTool
  // flags many missing commas once it checks the normal-case text: drop them.
  if (isMissingCommaMatch(match, original)) return { action: "drop" };

  switch (language) {
    case "de-DE":
      // AE/OE/UE for Ä/Ö/Ü is a valid spelling (FUER, MUETTER), in any case. Only a missing
      // umlaut (FUR) is an error.
      if (match.replacements.some((replacement) => isUmlautSpelledOut(original, replacement, language))) {
        return { action: "drop" };
      }
      if (isAllCaps(block.text, language)) {
        // ALL CAPS: noun-capitalization rules do not apply, and SS for ß is valid. Drop any
        // match that only asks for a different case or ß (same word_key as the original).
        if (match.categoryId === "CASING") return { action: "drop" };
        const originalKey = toWordKey(original, language);
        if (match.replacements.some((replacement) => toWordKey(replacement, language) === originalKey)) {
          return { action: "drop" };
        }
      }
      return { action: "keep", severity };

    case "fr-FR":
      // Missing space before ! ? : ; → info. Case-insensitive (normal-case copy, see above).
      const noSpace = (text: string) => text.replace(/\s/g, "").toLocaleLowerCase(language);
      if (match.replacements.some((replacement) => noSpace(replacement) === noSpace(original) && replacement.length !== original.length)) {
        return { action: "keep", severity: "info" };
      }
      return { action: "keep", severity };

    case "es-ES": {
      // Missing ¿ ¡ → warning.
      if (match.replacements.some((replacement) => /[¿¡]/.test(replacement) && !/[¿¡]/.test(original))) {
        return { action: "keep", severity: "warning" };
      }
      // Missing Ñ (ANO → AÑO) → error. LanguageTool rarely flags ANO itself (a real word);
      // this covers the words it does flag, Claude catches the rest from context.
      if (match.replacements.some((replacement) => isMissingEnye(original, replacement, language))) {
        return { action: "keep", severity: "error" };
      }
      // Missing accent that changes the meaning → error.
      const base = stripAccents(original).toLocaleLowerCase(language);
      if (
        ES_MEANING_ACCENT_WORDS.has(base) &&
        match.replacements.some((replacement) => differsOnlyByAccents(original, replacement, language))
      ) {
        return { action: "keep", severity: "error" };
      }
      return { action: "keep", severity };
    }
  }
}
