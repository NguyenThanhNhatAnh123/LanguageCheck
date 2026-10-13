import { ArrowRightIcon, TypeIcon } from "lucide-react";
import { AddToDictionaryButton } from "@/components/dictionary/add-to-dictionary-button";
import { AddWordsPopover } from "@/components/dictionary/add-words-popover";
import { SeverityBadge } from "@/components/status-badge";
import { sourceLabel } from "@/lib/analysis/labels";
import { isSpellingIssue } from "@/lib/analysis/pipeline";
import { addedSpecialCharacters } from "@/lib/analysis/special-chars";
import type { Issue } from "@/lib/analysis/types";
import { splitWords } from "@/lib/dictionary/split-words";
import type { Language } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { UNDERLINE_CLASSES } from "./highlighted-text";

/**
 * What the dictionary action offers for this issue: one word, several words (picked one by
 * one), or nothing. Nothing for spots Claude could not read ([?], ocr_uncertain) and for
 * non-spelling issues, which the dictionary does not apply to (see isSpellingIssue).
 */
function dictionaryChoice(issue: Issue): { kind: "word"; word: string } | { kind: "words"; words: string[] } | null {
  if (!isSpellingIssue(issue) || issue.original.includes("[?]")) return null;
  const words = splitWords(issue.original).filter((word) => word.length <= 100);
  if (words.length === 1) return { kind: "word", word: words[0] };
  return words.length > 1 ? { kind: "words", words } : null;
}

export function IssueItem({ issue, language }: { issue: Issue; language: Language | null }) {
  const ltOnly = !issue.sources.includes("claude");
  const notes = issue.suggestions.filter((suggestion) => suggestion.noteVi);
  const choice = language ? dictionaryChoice(issue) : null;
  // The fix that goes into "Chữ sau khi sửa" adds Ä Ö Ü ß É È Ç Ñ ¿ ¡…: maybe the font lacks them.
  const specialChars = issue.suggestions.length > 0 ? addedSpecialCharacters(issue.original, issue.suggestions[0].text) : [];

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-mono text-sm", UNDERLINE_CLASSES[issue.severity])}>{issue.original}</span>
        {issue.suggestions.length > 0 && (
          <>
            <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="sửa thành" />
            <span className="flex flex-wrap gap-1.5">
              {issue.suggestions.map((suggestion, index) => (
                <span
                  key={index}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-xs",
                    index === 0
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {suggestion.text}
                </span>
              ))}
            </span>
          </>
        )}
      </div>

      {ltOnly ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{issue.ltLabelVi}.</span> LanguageTool: {issue.ltMessages[0]}
        </p>
      ) : (
        issue.explanationVi && <p className="text-sm text-muted-foreground">{issue.explanationVi}</p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {notes.map((suggestion, index) => (
            <li key={index}>
              <span className="font-mono">{suggestion.text}</span>: {suggestion.noteVi}
            </li>
          ))}
        </ul>
      )}

      {specialChars.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="font-hint">
          <TypeIcon className="size-3.5 shrink-0" aria-hidden />
          <span>
            Nếu font không có ký tự này (<span className="font-mono text-foreground">{specialChars.join(" ")}</span>), hãy đổi font.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <SeverityBadge severity={issue.severity} />
        <span>Nguồn: {sourceLabel(issue.sources)}</span>
        {issue.intentionalPossible && <span>· Có thể cố ý</span>}
        {issue.start === null && <span>· Không định vị được trong chữ</span>}
        {language && choice && (
          <span className="ml-auto">
            {choice.kind === "word" ? (
              <AddToDictionaryButton word={choice.word} language={language} />
            ) : (
              <AddWordsPopover words={choice.words} language={language} />
            )}
          </span>
        )}
      </div>
    </li>
  );
}
