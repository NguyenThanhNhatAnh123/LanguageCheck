import type { ClaudeAnalysis, ClaudeBlock, Severity } from "@/lib/claude/schema";
import type { DictionaryMatcher } from "@/lib/dictionary/matcher";
import { splitWords } from "@/lib/dictionary/split-words";
import { isLanguage, isUncheckedLanguage, type Language } from "@/lib/languages";
import { applyLtLanguageRules, ltLabelVi } from "./languagetool-rules";
import { applyCaseStyle, caseStyleOf, differsOnlyByAccents, differsOnlyBySpecialCharacters, isAllCaps, isMissingEnye, isUmlautSpelledOut } from "./text-case";
import type {
  AnalysisInput,
  AnalysisResult,
  AnalysisStatus,
  Issue,
  IssueSource,
  LtBlockMatch,
  ResultBlock,
  Suggestion,
} from "./types";

// Pure and Node-free: the client re-runs analyzeTexts() with an updated dictionary.
// Order follows CLAUDE.md "Luồng xử lý" step 3:
//   locate Claude issues → LanguageTool matches (language rules) → dictionary filter →
//   merge → suggestions → fr-FR ALL CAPS accent rule → status → corrected text.

const MAX_SUGGESTIONS = 3;
const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

/** Language used for a block's rules and case conversion. */
function blockLanguage(block: ClaudeBlock, analysis: ClaudeAnalysis): Language | undefined {
  if (isLanguage(block.language)) return block.language;
  // English and other unchecked languages: not checked at all, so no fallback either.
  if (isUncheckedLanguage(block.language)) return undefined;
  return isLanguage(analysis.language) ? analysis.language : undefined;
}

/** Index of the n-th (1-based) occurrence of `needle` in `haystack`, or -1. */
export function findOccurrence(haystack: string, needle: string, occurrence: number): number {
  let from = 0;
  for (let n = 1; ; n++) {
    const index = haystack.indexOf(needle, from);
    if (index === -1 || n === occurrence) return index;
    from = index + 1;
  }
}

interface DraftIssue extends Omit<Issue, "id"> {
  /** Internal: suggestions as replacements for [start, end) before re-basing. */
  rawSuggestions: Suggestion[];
}

function claudeIssues(analysis: ClaudeAnalysis): { issues: DraftIssue[]; notFound: number } {
  let notFound = 0;
  // The tool does not check English (UNCHECKED_LANGUAGES): Claude is told not to report issues
  // there, and any it reports anyway are dropped.
  const checked = analysis.issues.filter((issue) => !isUncheckedLanguage(analysis.blocks[issue.block_index].language));
  const issues = checked.map((issue): DraftIssue => {
    const block = analysis.blocks[issue.block_index];
    const start = findOccurrence(block.text, issue.original, issue.occurrence ?? 1);
    const located = start !== -1;
    if (!located) notFound += 1;
    const suggestions = issue.suggestions.map((s): Suggestion => ({ text: s.text, noteVi: s.note_vi, source: "claude" }));
    return {
      blockIndex: issue.block_index,
      start: located ? start : null,
      end: located ? start + issue.original.length : null,
      original: issue.original,
      sources: ["claude"],
      // `original` not found in the block: keep the issue but at most a warning
      // (docs/claude-analyze-prompt.md "Ghi chú triển khai").
      severity: located ? issue.severity : minSeverity(issue.severity, "warning"),
      intentionalPossible: issue.intentional_possible,
      type: issue.type,
      ltIssueType: null,
      explanationVi: issue.explanation_vi,
      ltLabelVi: null,
      ltMessages: [],
      suggestions,
      rawSuggestions: suggestions,
    };
  });
  return { issues, notFound };
}

function ltIssues(analysis: ClaudeAnalysis, matches: readonly LtBlockMatch[]): DraftIssue[] {
  return matches.flatMap((match): DraftIssue[] => {
    const block = analysis.blocks[match.blockIndex];
    if (!block || !isLanguage(block.language) || match.end > block.text.length) return [];
    const outcome = applyLtLanguageRules(match, block, block.language);
    if (outcome.action === "drop") return [];
    const suggestions = match.replacements.map((text): Suggestion => ({ text, noteVi: null, source: "lt" }));
    return [
      {
        blockIndex: match.blockIndex,
        start: match.start,
        end: match.end,
        original: block.text.slice(match.start, match.end),
        sources: ["lt"],
        severity: outcome.severity,
        intentionalPossible: false,
        type: null,
        ltIssueType: match.issueType,
        explanationVi: null,
        ltLabelVi: ltLabelVi(match.issueType),
        ltMessages: [match.message],
        suggestions,
        rawSuggestions: suggestions,
      },
    ];
  });
}

/** Words in the team dictionary are never errors, whichever source flagged them. */
const SPELLING_TYPES = new Set<string>(["spelling", "capitalization", "accent"]);

/**
 * Spelling-type issues are the only ones the team dictionary applies to: Claude's
 * spelling/capitalization/accent, LanguageTool's misspelling. A grammar error on a word
 * (YOUR → YOU'RE, petites chose) is not explained away by that word being in the dictionary.
 */
export function isSpellingIssue(issue: Pick<Issue, "type" | "ltIssueType">): boolean {
  return issue.type !== null ? SPELLING_TYPES.has(issue.type) : issue.ltIssueType === "misspelling";
}

/**
 * A spelling-type issue whose text is in the team dictionary: the whole `original`, or, when
 * it spans several words ("HAIDA NATION"), every one of its words.
 */
function inDictionary(issue: DraftIssue, analysis: ClaudeAnalysis, dictionary: DictionaryMatcher): boolean {
  if (!isSpellingIssue(issue)) return false;
  const language = blockLanguage(analysis.blocks[issue.blockIndex], analysis);
  if (language === undefined) return false;
  if (dictionary.has(issue.original.trim(), language)) return true;
  const words = splitWords(issue.original);
  return words.length > 0 && words.every((word) => dictionary.has(word, language));
}

const overlaps = (a: DraftIssue, b: DraftIssue) =>
  a.blockIndex === b.blockIndex && a.start !== null && a.end !== null && b.start !== null && b.end !== null && a.start < b.end && b.start < a.end;

/** Re-bases a replacement for [from, to) onto the wider span [spanStart, spanEnd). */
function rebase(text: string, suggestion: Suggestion, from: number, to: number, spanStart: number, spanEnd: number): Suggestion {
  return { ...suggestion, text: text.slice(spanStart, from) + suggestion.text + text.slice(to, spanEnd) };
}

/**
 * Overlapping Claude + LanguageTool issues in the same block become one issue with both
 * sources. The merged span is the union of the spans, and every suggestion is re-based onto
 * it, so a LanguageTool replacement for "petites chose" and Claude's for "chose" both
 * replace the same text.
 */
function mergeIssues(analysis: ClaudeAnalysis, claude: DraftIssue[], lt: DraftIssue[]): DraftIssue[] {
  const absorbed = new Set<DraftIssue>();
  const merged = claude.map((claudeIssue) => {
    const partners = lt.filter((ltIssue) => !absorbed.has(ltIssue) && overlaps(claudeIssue, ltIssue));
    if (partners.length === 0) return claudeIssue;
    partners.forEach((partner) => absorbed.add(partner));

    const text = analysis.blocks[claudeIssue.blockIndex].text;
    const all = [claudeIssue, ...partners];
    const spanStart = Math.min(...all.map((issue) => issue.start ?? 0));
    const spanEnd = Math.max(...all.map((issue) => issue.end ?? 0));
    const rebased = all.flatMap((issue) =>
      issue.rawSuggestions.map((s) => rebase(text, s, issue.start ?? 0, issue.end ?? 0, spanStart, spanEnd)),
    );

    const ltSeverityMax = partners.reduce<Severity>((max, issue) => maxSeverity(max, issue.severity), "info");
    // Claude understands context; LanguageTool does not. If Claude says intentional or info,
    // Claude wins (e.g. GONNA: LanguageTool "misspelling", Claude intentional → info).
    const claudeWins = claudeIssue.intentionalPossible || claudeIssue.severity === "info";

    return {
      ...claudeIssue,
      start: spanStart,
      end: spanEnd,
      original: text.slice(spanStart, spanEnd),
      sources: ["claude", "lt"] as IssueSource[],
      severity: claudeWins ? claudeIssue.severity : maxSeverity(claudeIssue.severity, ltSeverityMax),
      ltIssueType: partners[0].ltIssueType,
      ltMessages: partners.flatMap((issue) => issue.ltMessages),
      suggestions: rebased,
      rawSuggestions: rebased,
    };
  });
  return [...merged, ...lt.filter((issue) => !absorbed.has(issue))];
}

/**
 * A suggestion replaces exactly the issue's span. Models sometimes repeat the words around
 * it ("FREIND" → "BEST FRIEND" in "BEST FREIND"), which would duplicate them when applied.
 * Strips leading words equal to the words just before the span and trailing words equal to
 * the words just after it (case-insensitive), keeping at least one word.
 */
export function trimSuggestionContext(suggestion: string, blockText: string, start: number, end: number, locale: string | undefined): string {
  const tokens = [...suggestion.matchAll(/\S+/g)];
  if (tokens.length < 2) return suggestion;
  const key = (word: string) => word.normalize("NFC").toLocaleLowerCase(locale);
  const before = blockText.slice(0, start).match(/\S+/g) ?? [];
  const after = blockText.slice(end).match(/\S+/g) ?? [];

  let lead = 0;
  for (let k = Math.min(before.length, tokens.length - 1); k > 0; k--) {
    if (before.slice(-k).every((word, i) => key(word) === key(tokens[i][0]))) {
      lead = k;
      break;
    }
  }
  let trail = 0;
  for (let m = Math.min(after.length, tokens.length - lead - 1); m > 0; m--) {
    if (after.slice(0, m).every((word, i) => key(word) === key(tokens[tokens.length - m + i][0]))) {
      trail = m;
      break;
    }
  }
  if (lead === 0 && trail === 0) return suggestion;
  const first = tokens[lead];
  const last = tokens[tokens.length - 1 - trail];
  return suggestion.slice(first.index, last.index + last[0].length);
}

/**
 * CLAUDE.md "Phương án sửa": match the case style of `original`, drop duplicates
 * (case-insensitive) and no-op suggestions, Claude's first, at most 3.
 */
export function processSuggestions(
  suggestions: readonly Suggestion[],
  original: string,
  blockText: string,
  locale: string | undefined,
): Suggestion[] {
  const style = caseStyleOf(original, blockText, locale);
  const ordered = [...suggestions.filter((s) => s.source === "claude"), ...suggestions.filter((s) => s.source === "lt")];
  const seen = new Set<string>();
  const result: Suggestion[] = [];
  for (const suggestion of ordered) {
    const text = applyCaseStyle(suggestion.text, style, locale);
    const key = text.toLocaleLowerCase(locale);
    if (text === original || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...suggestion, text });
    if (result.length === MAX_SUGGESTIONS) break;
  }
  return result;
}

/**
 * fr-FR: ALL CAPS text missing accents (ETE vs ÉTÉ) is only "info". Runs after merging so
 * it sees both sources' suggestions: any suggestion that differs only by accents counts.
 */
function applyFrenchCapsAccentRule(issue: DraftIssue, language: Language | undefined): DraftIssue {
  if (language !== "fr-FR" || !isAllCaps(issue.original, language)) return issue;
  const accentOnly = issue.suggestions.some((s) => differsOnlyByAccents(issue.original, s.text, language));
  return accentOnly ? { ...issue, severity: "info" } : issue;
}

/**
 * es-ES: a missing Ñ (ANO → AÑO) is always an error and never intentional, whichever source
 * reported it and whatever severity Claude gave.
 */
function applySpanishEnyeRule(issue: DraftIssue, language: Language | undefined): DraftIssue {
  if (language !== "es-ES") return issue;
  const missingEnye = issue.suggestions.some((s) => isMissingEnye(issue.original, s.text, language));
  return missingEnye ? { ...issue, severity: "error", intentionalPossible: false } : issue;
}

/**
 * de-DE: AE/OE/UE for Ä/Ö/Ü (FUER, MUETTER) is a valid spelling, so an issue that only asks
 * for the umlaut is dropped, from either source. LanguageTool often flags such a word
 * without offering the umlaut form (FUER → FU, VFR), so a spelling match it alone reports on
 * a word with AE/OE/UE is dropped too; if Claude flagged the same spot, Claude's judgment
 * stands. A missing umlaut (FUR) is not affected.
 */
function isGermanSpelledOutUmlaut(issue: DraftIssue, language: Language | undefined): boolean {
  if (language !== "de-DE") return false;
  if (issue.suggestions.some((s) => isUmlautSpelledOut(issue.original, s.text, language))) return true;
  const ltOnlySpelling = !issue.sources.includes("claude") && issue.ltIssueType === "misspelling";
  return ltOnlySpelling && /ae|oe|ue/i.test(issue.original);
}

/**
 * A spelling error only Claude reports, on a word LanguageTool checked and accepted, is at
 * most a warning. LanguageTool's dictionary is reliable for spelling, while Claude sometimes
 * flags a correct but uncommon form (ICH WOG MAL: "wog" is the past tense of "wiegen").
 * "Checked" means LanguageTool ran (online) on this block's own language; "accepted" means it
 * has no match there (a Claude-only issue after merging). Not applied when a suggestion only
 * adds accents or special characters (ANO → AÑO, TU → TÚ): LanguageTool accepts ANO because
 * it is a real word, and the language rules decide those. Grammar issues are not affected.
 */
function applyLtAcceptedSpellingRule(issue: DraftIssue, language: Language | undefined, ltChecked: boolean): DraftIssue {
  if (!ltChecked || issue.type !== "spelling") return issue;
  if (issue.sources.length !== 1 || issue.sources[0] !== "claude") return issue;
  if (issue.suggestions.some((s) => differsOnlyBySpecialCharacters(issue.original, s.text, language))) return issue;
  return { ...issue, severity: minSeverity(issue.severity, "warning"), ltAccepted: true };
}

/**
 * An error only Claude reports, with no suggestion left (after trimming and dropping no-op
 * ones), is at most a warning: Claude could not say how to fix it, so it is not sure, and
 * Sonnet has flagged correct forms this way (ICH WOG MAL, typed grammar). Not applied when
 * LanguageTool reports the same spot.
 */
function applyNoFixRule(issue: DraftIssue): DraftIssue {
  if (issue.severity !== "error" || issue.suggestions.length > 0) return issue;
  if (issue.sources.length !== 1 || issue.sources[0] !== "claude") return issue;
  return { ...issue, severity: "warning" };
}

/**
 * CLAUDE.md "Cách tính status". info issues never count. Text in a language the tool does
 * not check (English) makes the image at least a warning: someone has to check it by hand.
 */
export function computeStatus(
  hasText: boolean,
  issues: readonly Pick<Issue, "severity" | "sources" | "intentionalPossible" | "type">[],
  hasUncheckedText = false,
): AnalysisStatus {
  if (!hasText) return "no_text";
  const isError = issues.some(
    (issue) =>
      issue.severity === "error" &&
      ((issue.sources.includes("claude") && issue.sources.includes("lt")) ||
        (issue.sources.includes("claude") && !issue.intentionalPossible)),
  );
  if (isError) return "error";
  const isWarning = issues.some(
    (issue) => issue.severity === "error" || issue.severity === "warning" || issue.type === "ocr_uncertain",
  );
  return isWarning || hasUncheckedText ? "warning" : "ok";
}

/** Applies the first suggestion of every located, non-intentional error/warning (except ltAccepted ones). */
export function correctedText(blockText: string, issues: readonly Issue[]): string {
  const edits = issues
    .filter(
      (issue) =>
        (issue.severity === "error" || issue.severity === "warning") &&
        !issue.intentionalPossible &&
        !issue.ltAccepted &&
        issue.start !== null &&
        issue.end !== null &&
        issue.suggestions.length > 0,
    )
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));

  let text = blockText;
  let limit = Infinity; // skip edits overlapping one already applied (we go right to left)
  for (const issue of edits) {
    const start = issue.start ?? 0;
    const end = issue.end ?? 0;
    if (end > limit) continue;
    text = text.slice(0, start) + issue.suggestions[0].text + text.slice(end);
    limit = start;
  }
  return text;
}

export interface AnalyzeTextsResult {
  result: AnalysisResult;
  /** Claude issues whose `original` was not found in the block (logged as a count). */
  claudeIssuesNotFound: number;
}

export function analyzeTexts(input: AnalysisInput, dictionary: DictionaryMatcher): AnalyzeTextsResult {
  const { claude: analysis } = input;
  const hasText = analysis.has_text && analysis.blocks.some((block) => block.text.trim().length > 0);

  const { issues: fromClaude, notFound } = claudeIssues(analysis);
  const fromLt = ltIssues(analysis, input.ltMatches);

  const keep = (issue: DraftIssue) => !inDictionary(issue, analysis, dictionary);
  const merged = mergeIssues(analysis, fromClaude.filter(keep), fromLt.filter(keep));

  const issues: Issue[] = merged
    .map((issue) => {
      const block = analysis.blocks[issue.blockIndex];
      const language = blockLanguage(block, analysis);
      const { start, end } = issue;
      const trimmed =
        start === null || end === null
          ? issue.suggestions
          : issue.suggestions.map((s) => ({ ...s, text: trimSuggestionContext(s.text, block.text, start, end, language) }));
      const suggestions = processSuggestions(trimmed, issue.original, block.text, language);
      const processed = { ...issue, suggestions };
      if (isGermanSpelledOutUmlaut(processed, language)) return null;
      // LanguageTool only checks blocks whose own language is known (groupBlocksByLanguage).
      const ltChecked = input.ltStatus === "online" && isLanguage(block.language);
      const checked = applyNoFixRule(applyLtAcceptedSpellingRule(processed, language, ltChecked));
      return applySpanishEnyeRule(applyFrenchCapsAccentRule(checked, language), language);
    })
    .filter((issue): issue is DraftIssue => issue !== null)
    .sort((a, b) => a.blockIndex - b.blockIndex || (a.start ?? Infinity) - (b.start ?? Infinity))
    .map(toIssue);

  const blocks: ResultBlock[] = analysis.blocks.map((block) => ({
    index: block.index,
    text: block.text,
    role: block.role,
    language: block.language,
    legibility: block.legibility,
    correctedText: correctedText(block.text, issues.filter((issue) => issue.blockIndex === block.index)),
  }));

  const textBlocks = analysis.blocks.filter((block) => block.text.trim().length > 0);
  const uncheckedBlocks = textBlocks.filter((block) => isUncheckedLanguage(block.language)).map((block) => block.index);
  // Claude's overall note on an English-only image can only be about English, which the tool
  // does not check (it tends to point out English mistakes anyway): drop it. On a mixed image
  // the prompt tells Claude to leave English out of the note.
  const onlyUnchecked = textBlocks.length > 0 && uncheckedBlocks.length === textBlocks.length;

  return {
    result: {
      status: computeStatus(hasText, issues, uncheckedBlocks.length > 0),
      uncheckedBlocks,
      language: analysis.language,
      hasText,
      blocks,
      issues,
      notesVi: onlyUnchecked ? null : analysis.notes_vi,
      ltStatus: input.ltStatus,
    },
    claudeIssuesNotFound: notFound,
  };
}

/** Drops the internal rawSuggestions and assigns a stable id (order within the result). */
function toIssue(draft: DraftIssue, index: number): Issue {
  return {
    id: `issue-${index}`,
    blockIndex: draft.blockIndex,
    start: draft.start,
    end: draft.end,
    original: draft.original,
    sources: draft.sources,
    severity: draft.severity,
    intentionalPossible: draft.intentionalPossible,
    type: draft.type,
    ltIssueType: draft.ltIssueType,
    explanationVi: draft.explanationVi,
    ltLabelVi: draft.ltLabelVi,
    ltMessages: draft.ltMessages,
    suggestions: draft.suggestions,
    ...(draft.ltAccepted ? { ltAccepted: true } : {}),
  };
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function minSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}
