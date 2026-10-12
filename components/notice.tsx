import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "warning" | "error";

const TONES: Record<NoticeTone, string> = {
  info: "border-border bg-muted/40 text-foreground",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  error: "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300",
};

/** Slim banner: icon, one line of text, optional action on the right. */
export function Notice({
  tone,
  children,
  action,
  className,
}: {
  tone: NoticeTone;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? InfoIcon : TriangleAlertIcon;
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm", TONES[tone], className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
