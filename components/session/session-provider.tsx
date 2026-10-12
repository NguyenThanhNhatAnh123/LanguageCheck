"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { analyzeImage, type AnalyzeSuccess } from "@/lib/client/analyze-image";
import type { PickedImage } from "@/lib/client/collect-files";
import { TaskQueue } from "@/lib/client/task-queue";

// The checking session lives here, mounted once in the root layout, so moving between
// pages keeps it. It is lost only when the tab is closed or reloaded, or on
// "Kết thúc phiên" (CLAUDE.md "Nguyên tắc sản phẩm": results are never stored).

const MAX_PARALLEL_UPLOADS = 4;
const REAUTH_POLL_MS = 3_000;

export type ItemState = "queued" | "processing" | "done" | "failed";

export interface SessionItem extends PickedImage {
  id: string;
  /** Points at the user's own file; revoked when the session ends. */
  objectUrl: string;
  state: ItemState;
  response: AnalyzeSuccess | null;
  error: string | null;
}

type Action =
  | { type: "add"; items: SessionItem[] }
  | { type: "start"; id: string }
  | { type: "done"; id: string; response: AnalyzeSuccess }
  | { type: "fail"; id: string; error: string }
  | { type: "requeue"; ids: string[] }
  | { type: "reset" };

function reducer(items: SessionItem[], action: Action): SessionItem[] {
  const update = (id: string, change: Partial<SessionItem>) =>
    items.map((item) => (item.id === id ? { ...item, ...change } : item));
  switch (action.type) {
    case "add":
      return [...items, ...action.items];
    case "start":
      return update(action.id, { state: "processing" });
    case "done":
      return update(action.id, { state: "done", response: action.response, error: null });
    case "fail":
      return update(action.id, { state: "failed", error: action.error });
    case "requeue":
      return items.map((item) => (action.ids.includes(item.id) ? { ...item, state: "queued", error: null } : item));
    case "reset":
      return [];
  }
}

export interface SessionApi {
  items: SessionItem[];
  /** True once something finished (done or failed): ending the session loses work. */
  hasResults: boolean;
  /** The login session expired; the queue is paused until the user logs in again. */
  authExpired: boolean;
  addImages: (images: readonly PickedImage[]) => void;
  retry: (ids: readonly string[]) => void;
  endSession: () => void;
  /** Called when any request sees 401 (e.g. the header's health check). */
  reportAuthExpired: () => void;
}

const SessionContext = createContext<SessionApi | null>(null);

function ensureQueue(ref: React.RefObject<TaskQueue | null>): TaskQueue {
  ref.current ??= new TaskQueue(MAX_PARALLEL_UPLOADS);
  return ref.current;
}

export function useSession(): SessionApi {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(reducer, []);
  const [authExpired, setAuthExpired] = useState(false);

  const queue = useRef<TaskQueue | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  // Bumped by endSession(): late answers from a previous session are ignored.
  const sessionId = useRef(0);
  // Read by the beforeunload handler; updated synchronously on endSession() so that a
  // navigation right after it (logout) is not blocked by a stale warning.
  const hasItems = useRef(false);

  const pauseForReauth = useCallback(() => {
    ensureQueue(queue).pause();
    setAuthExpired(true);
  }, []);

  const makeTask = useCallback(
    (item: Pick<SessionItem, "id" | "file" | "name">) => {
      const session = sessionId.current;
      const task = async (): Promise<void> => {
        if (session !== sessionId.current) return;
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        dispatch({ type: "start", id: item.id });
        try {
          const outcome = await analyzeImage({ file: item.file, name: item.name }, controller.signal);
          if (session !== sessionId.current) return;
          if (outcome.kind === "unauthorized") {
            // Not a failure: put it back at the head of the queue and wait for re-login.
            dispatch({ type: "requeue", ids: [item.id] });
            pauseForReauth();
            ensureQueue(queue).pushFront(task);
          } else if (outcome.kind === "done") {
            dispatch({ type: "done", id: item.id, response: outcome.response });
          } else {
            dispatch({ type: "fail", id: item.id, error: outcome.error });
          }
        } catch {
          if (session === sessionId.current) dispatch({ type: "fail", id: item.id, error: "Đã hủy." });
        } finally {
          controllers.current.delete(item.id);
        }
      };
      return task;
    },
    [pauseForReauth],
  );

  const addImages = useCallback(
    (images: readonly PickedImage[]) => {
      const added: SessionItem[] = images.map((image) => {
        const objectUrl = URL.createObjectURL(image.file);
        objectUrls.current.add(objectUrl);
        return { ...image, id: crypto.randomUUID(), objectUrl, state: "queued", response: null, error: null };
      });
      if (added.length === 0) return;
      hasItems.current = true;
      dispatch({ type: "add", items: added });
      for (const item of added) ensureQueue(queue).push(makeTask(item));
    },
    [makeTask],
  );

  const retry = useCallback(
    (ids: readonly string[]) => {
      const targets = items.filter((item) => ids.includes(item.id) && item.state === "failed");
      dispatch({ type: "requeue", ids: targets.map((item) => item.id) });
      for (const item of targets) ensureQueue(queue).push(makeTask(item));
    },
    [items, makeTask],
  );

  const endSession = useCallback(() => {
    sessionId.current += 1;
    hasItems.current = false;
    queue.current?.clear();
    queue.current?.resume();
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    dispatch({ type: "reset" });
  }, []);

  // While the login session is expired, poll a cheap endpoint (and re-check when the tab
  // gets focus). As soon as the user has logged in again, in any tab, resume the queue.
  useEffect(() => {
    if (!authExpired) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!cancelled && response.ok) {
          setAuthExpired(false);
          ensureQueue(queue).resume();
        }
      } catch {
        // Offline: keep waiting.
      }
    };
    const timer = window.setInterval(check, REAUTH_POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [authExpired]);

  // Warn before closing or reloading the tab while there is a session to lose.
  useEffect(() => {
    hasItems.current = items.length > 0;
  }, [items.length]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasItems.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const value = useMemo<SessionApi>(
    () => ({
      items,
      hasResults: items.some((item) => item.state === "done" || item.state === "failed"),
      authExpired,
      addImages,
      retry,
      endSession,
      reportAuthExpired: pauseForReauth,
    }),
    [items, authExpired, addImages, retry, endSession, pauseForReauth],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
