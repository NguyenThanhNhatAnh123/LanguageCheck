"use client";

import { FolderOpenIcon, ImagesIcon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { collectFromDataTransfer, collectFromFiles, type CollectResult } from "@/lib/client/collect-files";
import { cn } from "@/lib/utils";

export function UploadZone({ onCollected }: { onCollected: (result: CollectResult) => void }) {
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

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
      )}
    >
      <UploadIcon className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">Kéo thả ảnh, cả thư mục hoặc file .zip vào đây</p>
        <p className="text-sm text-muted-foreground">JPG, PNG, WebP. Ảnh được thu nhỏ ngay trên máy bạn trước khi gửi đi.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
          <ImagesIcon /> Chọn ảnh hoặc .zip
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => folderInput.current?.click()}>
          <FolderOpenIcon /> Chọn thư mục
        </Button>
      </div>
      {busy && <p className="text-sm text-muted-foreground">Đang đọc file...</p>}
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
