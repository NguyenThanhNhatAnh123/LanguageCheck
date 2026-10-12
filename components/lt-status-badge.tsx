"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "checking" | "online" | "offline" | "expired";

const POLL_INTERVAL_MS = 30_000;

const healthSchema = z.object({ status: z.enum(["online", "offline"]) });

const LABELS: Record<Status, string> = {
  checking: "LanguageTool: đang kiểm tra",
  online: "LanguageTool: hoạt động",
  offline: "LanguageTool: mất kết nối",
  expired: "Phiên đăng nhập đã hết hạn",
};

const DOT_CLASSES: Record<Status, string> = {
  checking: "bg-muted-foreground",
  online: "bg-emerald-500",
  offline: "bg-red-500",
  expired: "bg-red-500",
};

export function LtStatusBadge() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      let next: Status = "offline";
      try {
        const response = await fetch("/api/lt-health", { cache: "no-store" });
        if (response.status === 401) {
          // Session expired or SESSION_VERSION changed. Do not navigate away: that would wipe
          // the results of the current session. The badge links to /login in a new tab.
          next = "expired";
        } else {
          const parsed = healthSchema.safeParse(await response.json());
          if (parsed.success) next = parsed.data.status;
        }
      } catch {
        // Network error: treat as offline.
      }
      if (!cancelled) setStatus(next);
    }

    void poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const badge = (
    <Badge variant="outline" className="gap-1.5" aria-live="polite">
      <span className={cn("size-2 rounded-full", DOT_CLASSES[status])} aria-hidden />
      {LABELS[status]}
    </Badge>
  );

  if (status !== "expired") return badge;
  return (
    <a href="/login" target="_blank" rel="noopener" title="Mở trang đăng nhập ở tab mới, kết quả ở tab này vẫn giữ nguyên">
      {badge}
    </a>
  );
}
