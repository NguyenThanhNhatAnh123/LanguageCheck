import type { ClaudeAnalysis, ClaudeBlock, Severity } from "@/lib/claude/schema";
import type { DictionaryMatcher } from "@/lib/dictionary/matcher";
import { LANGUAGES, type Language } from "@/lib/languages";
import { applyLtLanguageRules, ltLabelVi } from "./languagetool-rules";
import { applyCaseStyle, caseStyleOf, differsOnlyByAccents, isAllCaps } from "./text-case";
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

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** Language used for a block's rules and case conversion. */
function blockLanguage(block: ClaudeBlock, analysis: ClaudeAnalysis): Language | undefined {
  if (isLanguage(block.language)) return block.language;
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
  const issues = analysis.issues.map((issue): DraftIssue => {
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
function inDictionary(issue: DraftIssue, analysis: ClaudeAnalysis, dictionary: DictionaryMatcher): boolean {
  const language = blockLanguage(analysis.blocks[issue.blockIndex], analysis);
  return language !== undefined && dictionary.has(issue.original.trim(), language);
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

/** CLAUDE.md "Cách tính status". info issues never count. */
export function computeStatus(hasText: boolean, issues: readonly Pick<Issue, "severity" | "sources" | "intentionalPossible" | "type">[]): AnalysisStatus {
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
  return isWarning ? "warning" : "ok";
}

/** Applies the first suggestion of every located, non-intentional error/warning. */
export function correctedText(blockText: string, issues: readonly Issue[]): string {
  const edits = issues
    .filter(
      (issue) =>
        (issue.severity === "error" || issue.severity === "warning") &&
        !issue.intentionalPossible &&
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
      const suggestions = processSuggestions(issue.suggestions, issue.original, block.text, language);
      return applyFrenchCapsAccentRule({ ...issue, suggestions }, language);
    })
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

  return {
    result: {
      status: computeStatus(hasText, issues),
      language: analysis.language,
      hasText,
      blocks,
      issues,
      notesVi: analysis.notes_vi,
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
  };
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function minSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}
