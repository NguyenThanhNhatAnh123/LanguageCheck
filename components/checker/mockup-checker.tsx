"use client";

import { RotateCcwIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/notice";
import { useSession, type SessionItem } from "@/components/session/session-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AnalyzeSuccess } from "@/lib/client/analyze-image";
import type { CollectResult } from "@/lib/client/collect-files";
import { MockupThumbnail } from "./mockup-thumbnail";
import { ProcessingList } from "./processing-list";
import { ResultCard } from "./result-card";
import { ResultGroup } from "./result-group";
import { SummaryBar, type SessionSummary } from "./summary-bar";
import { UploadZone } from "./upload-zone";

function summarize(items: readonly SessionItem[]): SessionSummary {
  const summary: SessionSummary = { total: items.length, completed: 0, error: 0, warning: 0, ok: 0, noText: 0, failed: 0 };
  for (const item of items) {
    if (item.state === "failed") {
      summary.failed += 1;
      summary.completed += 1;
    } else if (item.state === "done" && item.response) {
      summary.completed += 1;
      const status = item.response.result.status;
      if (status === "error") summary.error += 1;
      else if (status === "warning") summary.warning += 1;
      else if (status === "ok") summary.ok += 1;
      else summary.noText += 1;
    }
  }
  return summary;
}

export function MockupChecker() {
  const session = useSession();
  const { items } = session;
  const [confirmEnd, setConfirmEnd] = useState(false);

  function onCollected(collected: CollectResult) {
    session.addImages(collected.images);
    const skipped = [
      collected.skipped > 0 ? `Bỏ qua ${collected.skipped} file không phải ảnh.` : null,
      collected.brokenZips > 0 ? `Không đọc được ${collected.brokenZips} file .zip.` : null,
    ].filter(Boolean);
    if (collected.images.length === 0) toast.warning("Không tìm thấy ảnh nào", { description: skipped.join(" ") || undefined });
    else toast.success(`Đã thêm ${collected.images.length} ảnh`, { description: skipped.join(" ") || undefined });
  }

  function endSession() {
    session.endSession();
    setConfirmEnd(false);
    toast("Đã kết thúc phiên", { description: "Toàn bộ kết quả đã được xóa." });
  }

  const summary = useMemo(() => summarize(items), [items]);
  const byStatus = (status: AnalyzeSuccess["result"]["status"]) =>
    items.filter((item) => item.state === "done" && item.response?.result.status === status);
  const errors = byStatus("error");
  const warnings = byStatus("warning");
  const failed = items.filter((item) => item.state === "failed");
  const processing = items.filter((item) => item.state === "processing");
  const queued = items.filter((item) => item.state === "queued").length;
  const ltOffline = items.filter((item) => item.response?.result.ltStatus === "offline").length;
  const mock = items.some((item) => item.response?.mock);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[calc(100svh-12rem)] flex-col justify-center gap-8 py-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Kiểm tra chữ trên mockup</h1>
          <p className="text-muted-foreground">Chỉ những mockup có lỗi hoặc đáng nghi mới hiện ra, kèm cách sửa.</p>
        </div>
        <UploadZone variant="hero" onCollected={onCollected} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Kiểm tra mockup</h1>
        {/* Nothing finished yet means nothing to lose: no confirmation needed. */}
        <Button variant="outline" size="sm" onClick={() => (session.hasResults ? setConfirmEnd(true) : endSession())}>
          <XIcon /> Kết thúc phiên
        </Button>
      </div>

      <UploadZone variant="compact" onCollected={onCollected} />

      {ltOffline > 0 && (
        <Notice tone="warning">LanguageTool đang lỗi, kết quả chỉ từ Claude ({ltOffline} ảnh bị ảnh hưởng).</Notice>
      )}
      {mock && (
        <Notice tone="info">Đang chạy chế độ mock: kết quả của Claude lấy từ dữ liệu mẫu (fixtures), không phải đọc từ ảnh thật.</Notice>
      )}

      <SummaryBar summary={summary} paused={session.authExpired} />

      <ProcessingList processing={processing} queued={queued} paused={session.authExpired} />

      {errors.length > 0 && (
        <ResultGroup title="Lỗi" count={errors.length} tone="red" defaultOpen>
          {errors.map((item) => item.response && <ResultCard key={item.id} name={item.name} objectUrl={item.objectUrl} result={item.response.result} />)}
        </ResultGroup>
      )}

      {warnings.length > 0 && (
        <ResultGroup title="Nghi ngờ" count={warnings.length} tone="amber" defaultOpen={false}>
          {warnings.map((item) => item.response && <ResultCard key={item.id} name={item.name} objectUrl={item.objectUrl} result={item.response.result} />)}
        </ResultGroup>
      )}

      {failed.length > 0 && (
        <ResultGroup title="Thất bại" count={failed.length} tone="neutral" defaultOpen>
          {failed.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => session.retry(failed.map((item) => item.id))}>
              <RotateCcwIcon /> Thử lại tất cả
            </Button>
          )}
          <div className="divide-y rounded-xl border bg-card" data-testid="failed-list">
            {failed.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <MockupThumbnail src={item.objectUrl} name={item.name} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.error}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => session.retry([item.id])}>
                  <RotateCcwIcon /> Thử lại
                </Button>
              </div>
            ))}
          </div>
        </ResultGroup>
      )}

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kết thúc phiên?</AlertDialogTitle>
            <AlertDialogDescription>
              Toàn bộ kết quả trong tab này sẽ bị xóa và không khôi phục được. Ảnh không được lưu ở đâu cả.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <Button variant="destructive" onClick={endSession}>
              Kết thúc phiên
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
