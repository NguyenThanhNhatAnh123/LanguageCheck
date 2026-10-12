import type { ClaudeBlock } from "@/lib/claude/schema";
import { check } from "@/lib/languagetool";
import { recordLanguageToolHealth } from "@/lib/languagetool-warmup";
import { groupBlocksByLanguage, mapMatchToBlock } from "./languagetool-rules";
import type { LtBlockMatch, LtStatus } from "./types";

/**
 * Checks Claude's blocks with LanguageTool: one request per language (blocks joined with
 * "\n"), "unknown" blocks skipped. Any failure means "offline": the result is then Claude
 * only, and the UI says so, rather than mixing in a partial LanguageTool answer.
 */
export async function runLanguageTool(blocks: readonly ClaudeBlock[]): Promise<{ status: LtStatus; matches: LtBlockMatch[] }> {
  const groups = groupBlocksByLanguage(blocks);
  if (groups.length === 0) return { status: "skipped", matches: [] };

  try {
    const perGroup = await Promise.all(
      groups.map(async (group) => {
        const matches = await check(group.text, group.language);
        return matches.flatMap((match) => mapMatchToBlock(group, match) ?? []);
      }),
    );
    recordLanguageToolHealth(true);
    return { status: "online", matches: perGroup.flat() };
  } catch (error) {
    console.warn(`[analyze] LanguageTool unavailable, Claude results only: ${error instanceof Error ? error.message : "unknown error"}`);
    recordLanguageToolHealth(false);
    return { status: "offline", matches: [] };
  }
}
