import { SEVERITY_LABELS, STATUS_LABELS } from "@/lib/analysis/labels";
import type { AnalysisStatus } from "@/lib/analysis/types";
import type { Severity } from "@/lib/claude/schema";
import { cn } from "@/lib/utils";

// Soft status colors: red = Lỗi, amber = Nghi ngờ, green = Không lỗi; neutral otherwise.
export type Tone = "red" | "amber" | "green" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  red: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  green: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  neutral: "bg-muted text-muted-foreground ring-border",
};

export const DOT_CLASSES: Record<Tone, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  neutral: "bg-muted-foreground/60",
};

const STATUS_TONE: Record<AnalysisStatus, Tone> = { error: "red", warning: "amber", ok: "green", no_text: "neutral" };
const SEVERITY_TONE: Record<Severity, Tone> = { error: "red", warning: "amber", info: "neutral" };

export function SoftBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  return <SoftBadge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</SoftBadge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <SoftBadge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABELS[severity]}</SoftBadge>;
}
