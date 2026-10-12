import { StatusBadge } from "@/components/status-badge";
import { languageLabel } from "@/lib/analysis/labels";
import type { AnalysisResult } from "@/lib/analysis/types";
import { isLanguage, type Language } from "@/lib/languages";
import { CorrectedText } from "./corrected-text";
import { HighlightedText } from "./highlighted-text";
import { IssueItem } from "./issue-item";
import { MockupThumbnail } from "./mockup-thumbnail";

function asLanguage(value: string): Language | null {
  return isLanguage(value) ? value : null;
}

export function ResultCard({ name, objectUrl, result }: { name: string; objectUrl: string; result: AnalysisResult }) {
  const blocks = result.blocks.filter((block) => block.text.trim().length > 0);

  return (
    <article data-slot="card" className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:flex-row">
      <MockupThumbnail src={objectUrl} name={name} className="aspect-square w-full self-start sm:w-40" />
      <div className="min-w-0 flex-1 space-y-5">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 truncate font-mono text-sm font-medium" title={name}>
            {name}
          </h3>
          <StatusBadge status={result.status} />
          <span className="text-xs text-muted-foreground">{languageLabel(result.language)}</span>
          {result.ltStatus === "offline" && (
            <span className="text-xs text-amber-700 dark:text-amber-400">Chỉ có kết quả Claude (LanguageTool lỗi)</span>
          )}
        </header>

        {blocks.map((block) => {
          const issues = result.issues.filter((issue) => issue.blockIndex === block.index);
          return (
            <section key={block.index} className="space-y-3">
              <HighlightedText text={block.text} issues={issues} />
              {issues.length > 0 && (
                <ul className="divide-y border-t pt-3">
                  {issues.map((issue) => (
                    <IssueItem key={issue.id} issue={issue} language={asLanguage(block.language) ?? asLanguage(result.language)} />
                  ))}
                </ul>
              )}
              {block.correctedText !== block.text && <CorrectedText text={block.correctedText} />}
            </section>
          );
        })}

        {result.notesVi && <p className="text-sm text-muted-foreground">Ghi chú: {result.notesVi}</p>}
      </div>
    </article>
  );
}
