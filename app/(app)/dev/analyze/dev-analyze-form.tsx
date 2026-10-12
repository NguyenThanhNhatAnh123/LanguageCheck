"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resizeImageForUpload } from "@/lib/client/resize-image";

interface Selected {
  name: string;
  objectUrl: string;
  originalBytes: number;
  uploadBytes: number;
}

export function DevAnalyzeForm() {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Object URLs point at the user's own file; release them when replaced or unmounted.
  useEffect(() => {
    return () => {
      if (selected) URL.revokeObjectURL(selected.objectUrl);
    };
  }, [selected]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPending(true);
    setResult(null);
    try {
      const upload = await resizeImageForUpload(file);
      setSelected({
        name: file.name,
        objectUrl: URL.createObjectURL(file),
        originalBytes: file.size,
        uploadBytes: upload.size,
      });

      const form = new FormData();
      form.append("image", upload, "upload.jpg");
      form.append("fileName", file.name);
      const startedAt = performance.now();
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const body: unknown = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      const elapsed = Math.round(performance.now() - startedAt);
      setResult(JSON.stringify({ httpStatus: response.status, elapsedMs: elapsed, body }, null, 2));
    } catch (error) {
      setResult(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    }
    setPending(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dev-image">Chọn 1 ảnh mockup</Label>
          <Input id="dev-image" type="file" accept="image/*" onChange={onFileChange} disabled={pending} />
        </div>
        {selected && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a local file */}
            <img src={selected.objectUrl} alt={selected.name} className="max-h-[60vh] rounded-lg border object-contain" />
            <p className="text-xs text-muted-foreground">
              {selected.name}: {Math.round(selected.originalBytes / 1024)} KB gốc → {Math.round(selected.uploadBytes / 1024)} KB
              gửi lên
            </p>
          </div>
        )}
      </div>
      <pre className="max-h-[75vh] overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs">
        {pending ? "Đang phân tích..." : (result ?? "Kết quả sẽ hiện ở đây.")}
      </pre>
    </div>
  );
}
