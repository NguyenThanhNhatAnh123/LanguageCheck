import { splitIntoSegments } from "@/lib/analysis/highlight";
import type { Issue } from "@/lib/analysis/types";
import type { Severity } from "@/lib/claude/schema";

const MARK_CLASSES: Record<Severity, string> = {
  error: "rounded-sm bg-red-100 text-red-900 underline decoration-red-500 decoration-2 underline-offset-2",
  warning: "rounded-sm bg-amber-100 text-amber-900 underline decoration-amber-500 decoration-2 underline-offset-2",
  info: "rounded-sm bg-sky-100 text-sky-900",
};

export function HighlightedText({ text, issues }: { text: string; issues: readonly Issue[] }) {
  return (
    <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {splitIntoSegments(text, issues).map((segment, index) =>
        segment.severity ? (
          <mark key={index} className={MARK_CLASSES[segment.severity]}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
