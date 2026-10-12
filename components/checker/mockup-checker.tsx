"use client";

import { RotateCcwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { analyzeImage, type AnalyzeSuccess } from "@/lib/client/analyze-image";
import type { CollectResult, PickedImage } from "@/lib/client/collect-files";
import { TaskQueue } from "@/lib/client/task-queue";
import { MockupThumbnail } from "./mockup-thumbnail";
import { ResultCard } from "./result-card";
import { SummaryBar, type SessionSummary } from "./summary-bar";
import { UploadZone } from "./upload-zone";

// Results live only in this component's state: closing the tab, reloading or
// "Kết thúc phiên" loses them, by design (CLAUDE.md "Nguyên tắc sản phẩm").

const MAX_PARALLEL_UPLOADS = 4;

type ItemState = "queued" | "processing" | "done" | "failed";

interface Item extends PickedImage {
  id: string;
  /** Points at the user's own file; revoked on "Kết thúc phiên" and unmount. */
  objectUrl: string;
  state: ItemState;
  response: AnalyzeSuccess | null;
  error: string | null;
}

type Action =
  | { type: "add"; items: Item[] }
  | { type: "start"; id: string }
  | { type: "done"; id: string; response: AnalyzeSuccess }
  | { type: "fail"; id: string; error: string }
  | { type: "retry"; ids: string[] }
  | { type: "reset" };

function reducer(items: Item[], action: Action): Item[] {
  const update = (id: string, change: Partial<Item>) => items.map((item) => (item.id === id ? { ...item, ...change } : item));
  switch (action.type) {
    case "add":
      return [...items, ...action.items];
    case "start":
      return update(action.id, { state: "processing" });
    case "done":
      return update(action.id, { state: "done", response: action.response, error: null });
    case "fail":
      return update(action.id, { state: "failed", error: action.error });
    case "retry":
      return items.map((item) => (action.ids.includes(item.id) ? { ...item, state: "queued", error: null } : item));
    case "reset":
      return [];
  }
}

function summarize(items: readonly Item[]): SessionSummary {
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
  const [items, dispatch] = useReducer(reducer, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const queueRef = useRef<TaskQueue | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  // Bumped by "Kết thúc phiên": late answers from the previous session are ignored.
  const sessionId = useRef(0);

  const enqueue = useCallback((item: Pick<Item, "id" | "file" | "name">) => {
    queueRef.current ??= new TaskQueue(MAX_PARALLEL_UPLOADS);
    const session = sessionId.current;
    queueRef.current.push(async () => {
      if (session !== sessionId.current) return;
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      dispatch({ type: "start", id: item.id });
      try {
        const outcome = await analyzeImage({ file: item.file, name: item.name }, controller.signal);
        if (session !== sessionId.current) return;
        if (outcome.kind === "done") dispatch({ type: "done", id: item.id, response: outcome.response });
        else dispatch({ type: "fail", id: item.id, error: outcome.error });
      } catch {
        if (session === sessionId.current) dispatch({ type: "fail", id: item.id, error: "Đã hủy." });
      } finally {
        controllers.current.delete(item.id);
      }
    });
  }, []);

  const onCollected = useCallback(
    (collected: CollectResult) => {
      const added: Item[] = collected.images.map((image) => {
        const objectUrl = URL.createObjectURL(image.file);
        objectUrls.current.add(objectUrl);
        return { ...image, id: crypto.randomUUID(), objectUrl, state: "queued", response: null, error: null };
      });
      dispatch({ type: "add", items: added });
      added.forEach(enqueue);

      const parts = [`Đã thêm ${added.length} ảnh.`];
      if (collected.skipped > 0) parts.push(`Bỏ qua ${collected.skipped} file không phải ảnh.`);
      if (collected.brokenZips > 0) parts.push(`Không đọc được ${collected.brokenZips} file .zip.`);
      setNotice(parts.join(" "));
    },
    [enqueue],
  );

  const retry = useCallback(
    (targets: Item[]) => {
      dispatch({ type: "retry", ids: targets.map((item) => item.id) });
      targets.forEach(enqueue);
    },
    [enqueue],
  );

  const endSession = useCallback(() => {
    sessionId.current += 1;
    queueRef.current?.clear();
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    dispatch({ type: "reset" });
    setNotice(null);
    setConfirmEnd(false);
  }, []);

  // Warn before closing or reloading the tab while there are results to lose.
  const hasItems = items.length > 0;
  useEffect(() => {
    if (!hasItems) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasItems]);

  // Leaving the page (client navigation) also ends the session.
  useEffect(() => {
    const urls = objectUrls.current;
    const inFlight = controllers.current;
    return () => {
      sessionId.current += 1;
      inFlight.forEach((controller) => controller.abort());
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const summary = useMemo(() => summarize(items), [items]);
  const byStatus = (status: AnalyzeSuccess["result"]["status"]) =>
    items.filter((item) => item.state === "done" && item.response?.result.status === status);
  const errors = byStatus("error");
  const warnings = byStatus("warning");
  const failed = items.filter((item) => item.state === "failed");
  const ltOffline = items.filter((item) => item.response?.result.ltStatus === "offline").length;
  const mock = items.some((item) => item.response?.mock);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kiểm tra mockup</h1>
        {hasItems && (
          <Button variant="outline" onClick={() => setConfirmEnd(true)}>
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
              <Button variant="outline" size="sm" onClick={() => retry(failed)}>
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
                <Button variant="outline" size="sm" onClick={() => retry([item])}>
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
