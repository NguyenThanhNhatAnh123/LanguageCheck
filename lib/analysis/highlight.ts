import type { Severity } from "@/lib/claude/schema";
import type { Issue } from "./types";

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export interface TextSegment {
  text: string;
  /** Most severe issue covering this segment, or null for plain text. */
  severity: Severity | null;
}

/** Splits block text at issue boundaries so each piece can be highlighted by severity. */
export function splitIntoSegments(text: string, issues: readonly Pick<Issue, "start" | "end" | "severity">[]): TextSegment[] {
  const located = issues.filter(
    (issue): issue is Pick<Issue, "severity"> & { start: number; end: number } =>
      issue.start !== null && issue.end !== null && issue.start < issue.end && issue.start < text.length,
  );
  const cuts = new Set<number>([0, text.length]);
  for (const issue of located) {
    cuts.add(Math.max(0, issue.start));
    cuts.add(Math.min(text.length, issue.end));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i], points[i + 1]];
    let severity: Severity | null = null;
    for (const issue of located) {
      if (issue.start < to && from < issue.end && (severity === null || RANK[issue.severity] > RANK[severity])) {
        severity = issue.severity;
      }
    }
    const previous = segments.at(-1);
    if (previous && previous.severity === severity) previous.text += text.slice(from, to);
    else segments.push({ text: text.slice(from, to), severity });
  }
  return segments;
}
