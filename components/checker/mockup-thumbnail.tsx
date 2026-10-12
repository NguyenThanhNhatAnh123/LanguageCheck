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
        className={cn("bg-checkerboard shrink-0 overflow-hidden rounded-md border", className)}
        title="Bấm để phóng to"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
        <img src={src} alt={name} loading="lazy" className="size-full object-contain" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95vh] sm:max-w-[min(95vw,1200px)]">
          <DialogTitle className="truncate pr-8">{name}</DialogTitle>
          <div className="bg-checkerboard flex max-h-[85vh] items-center justify-center overflow-auto rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
            <img src={src} alt={name} className="max-h-[85vh] object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
