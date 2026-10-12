"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
    } catch {
      // Clipboard can be blocked; the text is still selectable.
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-emerald-800">Chữ sau khi sửa</span>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Đã sao chép" : "Sao chép"}
        </Button>
      </div>
      <p className="font-mono text-sm whitespace-pre-wrap select-all">{text}</p>
    </div>
  );
}
