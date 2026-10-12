"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useSession } from "@/components/session/session-provider";
import { cn } from "@/lib/utils";

type Status = "checking" | "online" | "offline";

const POLL_INTERVAL_MS = 30_000;

const healthSchema = z.object({ status: z.enum(["online", "offline"]) });

const LABELS: Record<Status | "expired", string> = {
  checking: "LanguageTool: đang kiểm tra",
  online: "LanguageTool: hoạt động",
  offline: "LanguageTool: mất kết nối",
  expired: "Phiên đăng nhập đã hết hạn",
};

const DOT_CLASSES: Record<Status | "expired", string> = {
  checking: "bg-muted-foreground/60",
  online: "bg-emerald-500",
  offline: "bg-red-500",
  expired: "bg-red-500",
};

export function LtStatusBadge() {
  const { authExpired, reportAuthExpired } = useSession();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    // While expired, the session store polls /api/session instead.
    if (authExpired) return;
    let cancelled = false;

    async function poll() {
      let next: Status = "offline";
      try {
        const response = await fetch("/api/lt-health", { cache: "no-store" });
        if (response.status === 401) {
          // Do not navigate away (that would wipe the results): pause and show the banner.
          if (!cancelled) reportAuthExpired();
          return;
        }
        const parsed = healthSchema.safeParse(await response.json());
        if (parsed.success) next = parsed.data.status;
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
  }, [authExpired, reportAuthExpired]);

  const shown = authExpired ? "expired" : status;
  return (
    <span
      data-slot="badge"
      className={cn(
        "mr-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground sm:inline-flex",
        shown === "expired" && "text-red-600 dark:text-red-400",
      )}
      aria-live="polite"
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[shown])} aria-hidden />
      {LABELS[shown]}
    </span>
  );
}
