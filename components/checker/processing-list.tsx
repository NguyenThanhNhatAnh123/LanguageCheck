import { Loader2Icon } from "lucide-react";
import type { SessionItem } from "@/components/session/session-provider";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton cards for images being analyzed right now, plus a count of those still waiting. */
export function ProcessingList({ processing, queued, paused }: { processing: SessionItem[]; queued: number; paused: boolean }) {
  if (processing.length === 0 && queued === 0) return null;

  return (
    <section className="space-y-3" aria-label="Đang xử lý">
      <div className="grid gap-3 sm:grid-cols-2">
        {processing.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <div className="bg-checkerboard size-16 shrink-0 overflow-hidden rounded-lg border opacity-60">
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
              <img src={item.objectUrl} alt="" className="size-full object-contain" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate font-mono text-xs text-muted-foreground" title={item.name}>
                {item.name}
              </p>
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Đang phân tích" />
          </div>
        ))}
      </div>
      {queued > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {paused ? `${queued} ảnh đang chờ, tạm dừng cho tới khi đăng nhập lại.` : `${queued} ảnh đang chờ…`}
        </p>
      )}
    </section>
  );
}
