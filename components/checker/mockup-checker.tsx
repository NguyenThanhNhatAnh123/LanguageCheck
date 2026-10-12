"use client";

import { RotateCcwIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useSession, type SessionItem } from "@/components/session/session-provider";
import type { AnalyzeSuccess } from "@/lib/client/analyze-image";
import type { CollectResult } from "@/lib/client/collect-files";
import { MockupThumbnail } from "./mockup-thumbnail";
import { ResultCard } from "./result-card";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  function onCollected(collected: CollectResult) {
    session.addImages(collected.images);
    const parts = [`Đã thêm ${collected.images.length} ảnh.`];
    if (collected.skipped > 0) parts.push(`Bỏ qua ${collected.skipped} file không phải ảnh.`);
    if (collected.brokenZips > 0) parts.push(`Không đọc được ${collected.brokenZips} file .zip.`);
    setNotice(parts.join(" "));
  }

  function endSession() {
    session.endSession();
    setNotice(null);
    setConfirmEnd(false);
  }

  const summary = useMemo(() => summarize(items), [items]);
  const byStatus = (status: AnalyzeSuccess["result"]["status"]) =>
    items.filter((item) => item.state === "done" && item.response?.result.status === status);
  const errors = byStatus("error");
  const warnings = byStatus("warning");
  const failed = items.filter((item) => item.state === "failed");
  const ltOffline = items.filter((item) => item.response?.result.ltStatus === "offline").length;
  const mock = items.some((item) => item.response?.mock);
  const hasItems = items.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kiểm tra mockup</h1>
        {hasItems && (
          // Nothing finished yet means nothing to lose: no confirmation needed.
          <Button variant="outline" onClick={() => (session.hasResults ? setConfirmEnd(true) : endSession())}>
            <XIcon /> Kết thúc phiên
          </Button>
        )}
      </div>

      <UploadZone onCollected={onCollected} />

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {ltOffline > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            LanguageTool đang lỗi, kết quả chỉ từ Claude ({ltOffline} ảnh bị ảnh hưởng).
          </AlertDescription>
        </Alert>
      )}
      {mock && (
        <Alert>
          <AlertDescription>
            Đang chạy chế độ mock: kết quả của Claude lấy từ dữ liệu mẫu (fixtures), không phải đọc từ ảnh thật.
          </AlertDescription>
        </Alert>
      )}

      {hasItems && <SummaryBar summary={summary} />}

      {errors.length > 0 && (
        <details open className="group space-y-3">
          <summary className="cursor-pointer text-lg font-semibold text-red-700">Lỗi ({errors.length})</summary>
          <div className="mt-3 space-y-3">
            {errors.map((item) => item.response && <ResultCard key={item.id} name={item.name} objectUrl={item.objectUrl} result={item.response.result} />)}
          </div>
        </details>
      )}

      {warnings.length > 0 && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-lg font-semibold text-amber-700">Nghi ngờ ({warnings.length})</summary>
          <div className="mt-3 space-y-3">
            {warnings.map((item) => item.response && <ResultCard key={item.id} name={item.name} objectUrl={item.objectUrl} result={item.response.result} />)}
          </div>
        </details>
      )}

      {failed.length > 0 && (
        <details open className="space-y-3">
          <summary className="cursor-pointer text-lg font-semibold">Thất bại ({failed.length})</summary>
          <div className="mt-3 space-y-2">
            {failed.length > 1 && (
              <Button variant="outline" size="sm" onClick={() => session.retry(failed.map((item) => item.id))}>
                <RotateCcwIcon /> Thử lại tất cả
              </Button>
            )}
            {failed.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                <MockupThumbnail src={item.objectUrl} name={item.name} className="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => session.retry([item.id])}>
                  <RotateCcwIcon /> Thử lại
                </Button>
              </div>
            ))}
          </div>
        </details>
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
