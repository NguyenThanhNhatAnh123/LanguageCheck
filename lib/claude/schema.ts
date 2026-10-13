import { z } from "zod";
import { LANGUAGES, UNCHECKED_LANGUAGES } from "@/lib/languages";

// Output schema from docs/claude-analyze-prompt.md. Optional fields are `nullable` (and
// required) rather than omitted, which structured outputs support on every model.

/** Checked languages, languages Claude recognizes but the tool does not check (en-US), unknown. */
export const BLOCK_LANGUAGES = [...LANGUAGES, ...UNCHECKED_LANGUAGES, "unknown"] as const;
export type BlockLanguage = (typeof BLOCK_LANGUAGES)[number];

export const ISSUE_TYPES = [
  "spelling",
  "grammar",
  "punctuation",
  "accent",
  "capitalization",
  "word_choice",
  "ocr_uncertain",
] as const;
export type ClaudeIssueType = (typeof ISSUE_TYPES)[number];

export const SEVERITIES = ["error", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

const claudeBlockSchema = z.object({
  index: z.number().int(),
  text: z.string(),
  role: z.enum(["headline", "body", "small", "signature"]),
  language: z.enum(BLOCK_LANGUAGES),
  legibility: z.enum(["clear", "partial", "unclear"]),
});

const claudeSuggestionSchema = z.object({
  text: z.string(),
  note_vi: z.string().nullable(),
});

const claudeIssueSchema = z.object({
  block_index: z.number().int(),
  original: z.string(),
  /** Which appearance of `original` in the block (1 = first). null means 1. */
  occurrence: z.number().int().nullable(),
  type: z.enum(ISSUE_TYPES),
  severity: z.enum(SEVERITIES),
  intentional_possible: z.boolean(),
  explanation_vi: z.string(),
  suggestions: z.array(claudeSuggestionSchema),
});

/** Shape sent to the API as the structured-output JSON schema. */
export const claudeAnalysisSchema = z.object({
  has_text: z.boolean(),
  language: z.enum([...LANGUAGES, ...UNCHECKED_LANGUAGES, "mixed", "unknown"]),
  blocks: z.array(claudeBlockSchema),
  issues: z.array(claudeIssueSchema),
  notes_vi: z.string().nullable(),
});

export type ClaudeAnalysis = z.infer<typeof claudeAnalysisSchema>;
export type ClaudeBlock = z.infer<typeof claudeBlockSchema>;
export type ClaudeIssue = z.infer<typeof claudeIssueSchema>;

/**
 * Stricter checks than JSON schema can express: block indexes must match their position
 * and every issue must point at an existing block with a non-empty `original`.
 * A violation is treated like invalid JSON (retried once, then `failed`).
 */
const validatedClaudeAnalysisSchema = claudeAnalysisSchema.superRefine((analysis, ctx) => {
  analysis.blocks.forEach((block, position) => {
    if (block.index !== position) {
      ctx.addIssue({ code: "custom", path: ["blocks", position, "index"], message: "block index must equal its position" });
    }
  });
  analysis.issues.forEach((issue, position) => {
    if (issue.block_index < 0 || issue.block_index >= analysis.blocks.length) {
      ctx.addIssue({ code: "custom", path: ["issues", position, "block_index"], message: "block_index out of range" });
    }
    if (issue.original.length === 0) {
      ctx.addIssue({ code: "custom", path: ["issues", position, "original"], message: "original must not be empty" });
    }
  });
});

export type ParseClaudeResult =
  | { success: true; analysis: ClaudeAnalysis }
  | { success: false; reason: "invalid_json" | "invalid_schema" };

export function parseClaudeAnalysis(text: string): ParseClaudeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { success: false, reason: "invalid_json" };
  }
  const parsed = validatedClaudeAnalysisSchema.safeParse(json);
  return parsed.success ? { success: true, analysis: parsed.data } : { success: false, reason: "invalid_schema" };
}
