import { DOT_CLASSES, type Tone } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface SessionSummary {
  total: number;
  completed: number;
  error: number;
  warning: number;
  ok: number;
  noText: number;
  failed: number;
}

export function SummaryBar({ summary, paused }: { summary: SessionSummary; paused: boolean }) {
  const running = summary.completed < summary.total;
  const parts: Array<{ label: string; value: number; tone: Tone }> = [
    { label: "Lỗi", value: summary.error, tone: "red" },
    { label: "Nghi ngờ", value: summary.warning, tone: "amber" },
    { label: "Không lỗi", value: summary.ok, tone: "green" },
    { label: "Không có chữ", value: summary.noText, tone: "neutral" },
    { label: "Thất bại", value: summary.failed, tone: "neutral" },
  ];

  return (
    <div className="space-y-3 rounded-xl border bg-card px-4 py-3" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm tabular-nums" data-testid="summary">
        <span className="font-medium">
          Đã kiểm {summary.completed}/{summary.total}
        </span>
        {parts.map((part) => (
          <span key={part.label} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", DOT_CLASSES[part.tone])} aria-hidden />
            {part.label} <span className="font-medium text-foreground">{part.value}</span>
          </span>
        ))}
        {paused && <span className="text-red-600 dark:text-red-400">· Đang tạm dừng</span>}
      </p>
      {running && <Progress value={summary.total === 0 ? 0 : (summary.completed / summary.total) * 100} className="gap-0" />}
    </div>
  );
}
