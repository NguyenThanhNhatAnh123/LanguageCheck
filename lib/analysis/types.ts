import type { BlockLanguage, ClaudeAnalysis, ClaudeIssueType, Severity } from "@/lib/claude/schema";

// Shared by server and client: the client re-runs analyzeTexts() on the same raw input
// after "Thêm vào từ điển", so everything here must stay free of Node-only code.

export type IssueSource = "claude" | "lt";

export type AnalysisStatus = "error" | "warning" | "ok" | "no_text";

export type LtStatus = "online" | "offline" | "skipped";

/** A LanguageTool match already mapped onto one Claude block. */
export interface LtBlockMatch {
  blockIndex: number;
  /** Offsets inside blocks[blockIndex].text. */
  start: number;
  end: number;
  message: string;
  issueType: string | null;
  ruleId: string;
  categoryId: string | null;
  replacements: string[];
}

/** Raw material the result is computed from; kept by the client for re-filtering. */
export interface AnalysisInput {
  claude: ClaudeAnalysis;
  ltMatches: LtBlockMatch[];
  ltStatus: LtStatus;
}

export interface Suggestion {
  text: string;
  noteVi: string | null;
  source: IssueSource;
}

export interface Issue {
  id: string;
  blockIndex: number;
  /** Offsets inside the block text; null when Claude's `original` could not be found. */
  start: number | null;
  end: number | null;
  original: string;
  sources: IssueSource[];
  severity: Severity;
  intentionalPossible: boolean;
  /** Claude's issue type, null for LanguageTool-only issues. */
  type: ClaudeIssueType | null;
  /** LanguageTool rule.issueType, null for Claude-only issues. */
  ltIssueType: string | null;
  /** Claude's Vietnamese explanation (Claude-only and merged issues). */
  explanationVi: string | null;
  /** Vietnamese label for LanguageTool-only issues ("Lỗi chính tả", ...). */
  ltLabelVi: string | null;
  /** LanguageTool's own messages, shown as-is (never translated). */
  ltMessages: string[];
  suggestions: Suggestion[];
  /**
   * Claude-only spelling error on a word LanguageTool checked and accepted: capped at
   * warning, and its fix is not applied to "Chữ sau khi sửa" (the word is probably right).
   */
  ltAccepted?: boolean;
}

export interface ResultBlock {
  index: number;
  text: string;
  role: ClaudeAnalysis["blocks"][number]["role"];
  language: BlockLanguage;
  legibility: ClaudeAnalysis["blocks"][number]["legibility"];
  /** Block text with the first suggestion of every non-intentional error/warning applied. */
  correctedText: string;
}

export interface AnalysisResult {
  status: AnalysisStatus;
  language: ClaudeAnalysis["language"];
  hasText: boolean;
  blocks: ResultBlock[];
  issues: Issue[];
  notesVi: string | null;
  ltStatus: LtStatus;
  /** Blocks in a language the tool does not check (English): shown with "check by hand". */
  uncheckedBlocks: number[];
}
