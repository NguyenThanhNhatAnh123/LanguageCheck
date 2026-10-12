import { splitIntoSegments } from "@/lib/analysis/highlight";
import type { Issue } from "@/lib/analysis/types";
import type { Severity } from "@/lib/claude/schema";

// Wavy underline under the wrong words: red = Lỗi, amber = Nghi ngờ, dotted gray = Ghi chú.
export const UNDERLINE_CLASSES: Record<Severity, string> = {
  error: "underline decoration-red-500 decoration-wavy decoration-[1.5px] underline-offset-[5px]",
  warning: "underline decoration-amber-500 decoration-wavy decoration-[1.5px] underline-offset-[5px]",
  info: "underline decoration-muted-foreground/60 decoration-dotted decoration-[1.5px] underline-offset-[5px]",
};

/** Text read from the mockup, in the mono font, with issues underlined. */
export function HighlightedText({ text, issues }: { text: string; issues: readonly Issue[] }) {
  return (
    <p className="font-mono text-[15px] leading-7 whitespace-pre-wrap">
      {splitIntoSegments(text, issues).map((segment, index) =>
        segment.severity ? (
          <span key={index} className={UNDERLINE_CLASSES[segment.severity]}>
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
