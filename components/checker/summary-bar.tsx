import { Progress } from "@/components/ui/progress";

export interface SessionSummary {
  total: number;
  completed: number;
  error: number;
  warning: number;
  ok: number;
  noText: number;
  failed: number;
}

export function SummaryBar({ summary }: { summary: SessionSummary }) {
  const running = summary.completed < summary.total;
  const parts = [
    { label: "Lỗi", value: summary.error, className: "text-red-700" },
    { label: "Nghi ngờ", value: summary.warning, className: "text-amber-700" },
    { label: "Không lỗi", value: summary.ok, className: "text-emerald-700" },
    { label: "Không có chữ", value: summary.noText, className: "text-muted-foreground" },
    { label: "Thất bại", value: summary.failed, className: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-2 rounded-xl border bg-card p-4" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="summary">
        <span className="font-medium">
          Đã kiểm {summary.completed}/{summary.total}
        </span>
        {parts.map((part) => (
          <span key={part.label} className={part.className}>
            <span className="text-muted-foreground">—</span> {part.label} {part.value}
          </span>
        ))}
      </p>
      {running && <Progress value={summary.total === 0 ? 0 : (summary.completed / summary.total) * 100} />}
    </div>
  );
}
