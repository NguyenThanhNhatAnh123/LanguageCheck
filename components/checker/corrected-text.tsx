"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CorrectedText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Đã sao chép chữ sau khi sửa");
    } catch {
      toast.error("Trình duyệt chặn sao chép. Hãy bôi đen chữ rồi sao chép bằng tay.");
    }
  }

  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Chữ sau khi sửa</span>
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label="Sao chép chữ sau khi sửa" title="Sao chép">
          {copied ? <CheckIcon className="text-emerald-600 dark:text-emerald-400" /> : <CopyIcon />}
        </Button>
      </div>
      <p className="font-mono text-sm whitespace-pre-wrap select-all">{text}</p>
    </div>
  );
}
