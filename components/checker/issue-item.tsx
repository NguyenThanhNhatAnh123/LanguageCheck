import { ArrowRightIcon } from "lucide-react";
import { SeverityBadge } from "@/components/status-badge";
import { sourceLabel } from "@/lib/analysis/labels";
import type { Issue } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";
import { UNDERLINE_CLASSES } from "./highlighted-text";

export function IssueItem({ issue }: { issue: Issue }) {
  const ltOnly = !issue.sources.includes("claude");
  const notes = issue.suggestions.filter((suggestion) => suggestion.noteVi);

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

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <SeverityBadge severity={issue.severity} />
        <span>Nguồn: {sourceLabel(issue.sources)}</span>
        {issue.intentionalPossible && <span>· Có thể cố ý</span>}
        {issue.start === null && <span>· Không định vị được trong chữ</span>}
      </div>
    </li>
  );
}
