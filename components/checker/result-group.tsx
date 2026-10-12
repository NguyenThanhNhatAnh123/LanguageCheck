import { ChevronRightIcon } from "lucide-react";
import { DOT_CLASSES, type Tone } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/** Collapsible section ("Lỗi", "Nghi ngờ", "Thất bại") built on <details>. */
export function ResultGroup({
  title,
  count,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  tone: Tone;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="focus-ring flex cursor-pointer items-center gap-2 rounded-md py-1 select-none">
        <ChevronRightIcon
          className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
          aria-hidden
        />
        <span className={cn("size-2 rounded-full", DOT_CLASSES[tone])} aria-hidden />
        <span className="font-semibold tracking-tight">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
