"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Image shown from the user's own file (object URL); click to enlarge. */
export function MockupThumbnail({ src, name, className }: { src: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "bg-checkerboard focus-ring shrink-0 overflow-hidden rounded-lg border transition-opacity duration-150 hover:opacity-90",
          className,
        )}
        title="Bấm để phóng to"
        aria-label={`Phóng to ảnh ${name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
        <img src={src} alt={name} loading="lazy" className="size-full object-contain" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95vh] gap-3 sm:max-w-[min(95vw,1100px)]">
          <DialogTitle className="truncate pr-8 font-mono text-sm font-normal">{name}</DialogTitle>
          <div className="bg-checkerboard flex max-h-[82vh] items-center justify-center overflow-auto rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
            <img src={src} alt={name} className="max-h-[82vh] object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
