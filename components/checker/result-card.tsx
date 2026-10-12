import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { languageLabel, STATUS_LABELS } from "@/lib/analysis/labels";
import type { AnalysisResult } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";
import { CorrectedText } from "./corrected-text";
import { HighlightedText } from "./highlighted-text";
import { IssueItem } from "./issue-item";
import { MockupThumbnail } from "./mockup-thumbnail";

const STATUS_BADGE: Record<AnalysisResult["status"], string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  no_text: "",
};

export function ResultCard({ name, objectUrl, result }: { name: string; objectUrl: string; result: AnalysisResult }) {
  return (
    <Card className="flex-row gap-4 p-4">
      <MockupThumbnail src={objectUrl} name={name} className="size-36 sm:size-44" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate font-medium" title={name}>
            {name}
          </h3>
          <Badge variant="outline" className={cn(STATUS_BADGE[result.status])}>
            {STATUS_LABELS[result.status]}
          </Badge>
          <span className="text-xs text-muted-foreground">{languageLabel(result.language)}</span>
          {result.ltStatus === "offline" && (
            <span className="text-xs text-amber-700">Chỉ có kết quả Claude (LanguageTool lỗi)</span>
          )}
        </div>

        {result.blocks
          .filter((block) => block.text.trim().length > 0)
          .map((block) => {
            const issues = result.issues.filter((issue) => issue.blockIndex === block.index);
            return (
              <section key={block.index} className="space-y-2">
                <HighlightedText text={block.text} issues={issues} />
                {issues.length > 0 && (
                  <ul className="space-y-2">
                    {issues.map((issue) => (
                      <IssueItem key={issue.id} issue={issue} />
                    ))}
                  </ul>
                )}
                {block.correctedText !== block.text && <CorrectedText text={block.correctedText} />}
              </section>
            );
          })}

        {result.notesVi && <p className="text-sm text-muted-foreground">Ghi chú: {result.notesVi}</p>}
      </div>
    </Card>
  );
}
