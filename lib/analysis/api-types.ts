import type { ClaudeFailureReason } from "@/lib/claude/analyze";
import type { TokenUsage } from "@/lib/claude/transport";
import type { AnalysisInput, AnalysisResult } from "./types";

/** JSON returned by POST /api/analyze (HTTP 200). Input errors use 4xx with { error }. */
export type AnalyzeApiResponse =
  | {
      ok: true;
      mock: boolean;
      model: string;
      attempts: number;
      usage: TokenUsage;
      /** Raw material, kept by the client to recompute `result` after dictionary changes. */
      input: AnalysisInput;
      result: AnalysisResult;
    }
  | {
      ok: false;
      mock: boolean;
      reason: ClaudeFailureReason;
      /** Vietnamese, shown on the "Thất bại" card. */
      error: string;
      attempts: number;
    };
