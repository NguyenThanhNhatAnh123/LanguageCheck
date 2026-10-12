import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS, sourceLabel } from "@/lib/analysis/labels";
import type { Issue } from "@/lib/analysis/types";
import type { Severity } from "@/lib/claude/schema";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<Severity, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function IssueItem({ issue }: { issue: Issue }) {
  const ltOnly = !issue.sources.includes("claude");
  const notes = issue.suggestions.filter((suggestion) => suggestion.noteVi);

  return (
    <li className="space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn(SEVERITY_BADGE[issue.severity])}>
          {SEVERITY_LABELS[issue.severity]}
        </Badge>
        <Badge variant="outline">{sourceLabel(issue.sources)}</Badge>
        {issue.intentionalPossible && <Badge variant="secondary">Có thể cố ý</Badge>}
        {issue.start === null && <Badge variant="secondary">Không định vị được trong chữ</Badge>}
      </div>

      <p className="font-mono text-sm">
        <span className="text-red-700 line-through decoration-red-400">{issue.original}</span>
        {issue.suggestions.length > 0 && (
          <>
            <span className="mx-1.5 text-muted-foreground">→</span>
            {issue.suggestions.map((suggestion, index) => (
              <span key={index}>
                {index > 0 && <span className="mx-1 text-muted-foreground">/</span>}
                <span className={cn(index === 0 && "font-semibold text-emerald-700")}>{suggestion.text}</span>
              </span>
            ))}
          </>
        )}
      </p>

      {ltOnly ? (
        <p className="text-sm">
          <span className="font-medium">{issue.ltLabelVi}.</span>{" "}
          <span className="text-muted-foreground">LanguageTool: {issue.ltMessages[0]}</span>
        </p>
      ) : (
        issue.explanationVi && <p className="text-sm">{issue.explanationVi}</p>
      )}

      {notes.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {notes.map((suggestion, index) => (
            <li key={index}>
              {suggestion.text}: {suggestion.noteVi}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
