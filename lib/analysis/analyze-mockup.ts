import { analyzeWithClaude, CLAUDE_FAILURE_MESSAGES } from "@/lib/claude/analyze";
import type { ClaudeRuntime } from "@/lib/claude";
import { buildSystemPrompt } from "@/lib/claude/prompt";
import type { ImageMediaType } from "@/lib/claude/transport";
import { createDictionaryMatcher } from "@/lib/dictionary/matcher";
import { listDictionaryEntries } from "@/lib/dictionary/repository";
import { recordUsage } from "@/lib/usage";
import type { AnalyzeApiResponse } from "./api-types";
import { analyzeTexts } from "./pipeline";
import { runLanguageTool } from "./run-languagetool";
import type { AnalysisInput } from "./types";

/**
 * One mockup through the whole server pipeline (CLAUDE.md "Luồng xử lý" step 3), shared by
 * POST /api/analyze and `npm run eval`. The image only lives in memory for this call.
 */
export async function analyzeMockup(
  image: { data: Buffer; mediaType: ImageMediaType; fileName: string },
  runtime: ClaudeRuntime,
): Promise<AnalyzeApiResponse> {
  const dictionary = listDictionaryEntries();

  // 1. Claude: transcription + proofreading.
  const outcome = await analyzeWithClaude(
    {
      image: { data: image.data, mediaType: image.mediaType },
      fileName: image.fileName,
      systemPrompt: buildSystemPrompt(dictionary),
    },
    { transport: runtime.transport, maxConcurrency: runtime.maxConcurrency },
  );

  // Every attempt that reached Claude is billed. Mock calls cost nothing and are not recorded.
  if (!runtime.mock && outcome.attempts > 0) recordUsage(outcome.usage);

  if (!outcome.ok) {
    return {
      ok: false,
      mock: runtime.mock,
      reason: outcome.reason,
      error: CLAUDE_FAILURE_MESSAGES[outcome.reason],
      attempts: outcome.attempts,
    };
  }

  // 2. LanguageTool on the transcribed blocks; 3–4. filter, merge, status, corrected text.
  const lt = await runLanguageTool(outcome.analysis.blocks);
  const input: AnalysisInput = { claude: outcome.analysis, ltMatches: lt.matches, ltStatus: lt.status };
  const { result, claudeIssuesNotFound } = analyzeTexts(input, createDictionaryMatcher(dictionary));
  if (claudeIssuesNotFound > 0) {
    console.warn(`[analyze] ${claudeIssuesNotFound} Claude issue(s) not found in their block, downgraded to warning`);
  }

  return {
    ok: true,
    mock: runtime.mock,
    model: outcome.model,
    attempts: outcome.attempts,
    usage: outcome.usage,
    input,
    result,
  };
}
