"use client";

import { FolderOpenIcon, ImagesIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { collectFromDataTransfer, collectFromFiles, type CollectResult } from "@/lib/client/collect-files";
import { cn } from "@/lib/utils";

/**
 * Drop zone for images, folders and .zip files. "hero" fills the empty page; "compact" is a
 * slim bar above the results.
 */
export function UploadZone({ onCollected, variant }: { onCollected: (result: CollectResult) => void; variant: "hero" | "compact" }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  // React has no typed prop for folder picking; set the attributes directly.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  async function collect(work: Promise<CollectResult>) {
    setBusy(true);
    try {
      onCollected(await work);
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow picking the same files again
    if (files.length > 0) void collect(collectFromFiles(files));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void collect(collectFromDataTransfer(event.dataTransfer));
  }

  const buttons = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" variant={variant === "hero" ? "default" : "outline"} size={variant === "hero" ? "default" : "sm"} disabled={busy} onClick={() => fileInput.current?.click()}>
        <ImagesIcon /> Chọn ảnh hoặc .zip
      </Button>
      <Button type="button" variant="outline" size={variant === "hero" ? "default" : "sm"} disabled={busy} onClick={() => folderInput.current?.click()}>
        <FolderOpenIcon /> Chọn thư mục
      </Button>
    </div>
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "border border-dashed transition-colors duration-150",
        dragging ? "border-foreground/50 bg-muted/60" : "border-foreground/15 hover:border-foreground/30",
        variant === "hero"
          ? "flex flex-col items-center gap-5 rounded-2xl px-6 py-16 text-center sm:py-24"
          : "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
      )}
    >
      {variant === "hero" ? (
        <>
          <div className="flex size-12 items-center justify-center rounded-xl border bg-card">
            {busy ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <UploadIcon className="size-5" aria-hidden />}
          </div>
          <div className="space-y-1.5">
            <p className="text-lg font-medium tracking-tight">Thả mockup vào đây để kiểm tra chữ</p>
            <p className="text-sm text-muted-foreground">
              Nhiều ảnh, cả thư mục hoặc file .zip · JPG, PNG, WebP · ảnh được thu nhỏ ngay trên máy bạn và không được lưu
            </p>
          </div>
          {buttons}
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <UploadIcon className="size-4" aria-hidden />}
            {busy ? "Đang đọc file…" : "Kéo thả thêm ảnh, thư mục hoặc .zip vào đây"}
          </p>
          {buttons}
        </>
      )}
      <input
        ref={fileInput}
        id="upload-files"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.zip,application/zip"
        className="hidden"
        onChange={onInputChange}
      />
      <input ref={folderInput} id="upload-folder" type="file" multiple className="hidden" onChange={onInputChange} />
    </div>
  );
}
