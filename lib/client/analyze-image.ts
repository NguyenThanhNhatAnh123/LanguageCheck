import { z } from "zod";
import type { AnalyzeApiResponse } from "@/lib/analysis/api-types";
import type { PickedImage } from "./collect-files";
import { resizeImageForUpload } from "./resize-image";

// Browser-only: one mockup through resize → POST /api/analyze.

export type AnalyzeSuccess = Extract<AnalyzeApiResponse, { ok: true }>;

export type ClientAnalyzeOutcome =
  | { kind: "done"; response: AnalyzeSuccess }
  | { kind: "failed"; error: string }
  /** The login session expired: the caller pauses the queue and retries after re-login. */
  | { kind: "unauthorized" };

const errorBodySchema = z.object({ error: z.string() });

// Light shape check of our own API's answer; the full types come from api-types.ts.
const responseShapeSchema = z.union([
  z.object({ ok: z.literal(true), result: z.object({ status: z.enum(["error", "warning", "ok", "no_text"]) }) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export async function analyzeImage(image: PickedImage, signal: AbortSignal): Promise<ClientAnalyzeOutcome> {
  let upload: Blob;
  try {
    upload = await resizeImageForUpload(image.file);
  } catch {
    return { kind: "failed", error: "Không đọc được ảnh (file hỏng hoặc định dạng không hỗ trợ)." };
  }

  const form = new FormData();
  form.append("image", upload, "upload.jpg");
  form.append("fileName", image.name);

  let response: Response;
  try {
    response = await fetch("/api/analyze", { method: "POST", body: form, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return { kind: "failed", error: "Mất kết nối tới máy chủ." };
  }

  if (response.status === 401) return { kind: "unauthorized" };

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(body);
    return { kind: "failed", error: parsed.success ? parsed.data.error : `Máy chủ lỗi (HTTP ${response.status}).` };
  }

  const shape = responseShapeSchema.safeParse(body);
  if (!shape.success) return { kind: "failed", error: "Máy chủ trả về dữ liệu không hợp lệ." };
  if (!shape.data.ok) return { kind: "failed", error: shape.data.error };
  // Shape verified above; the rest of the payload follows AnalyzeApiResponse.
  return { kind: "done", response: body as AnalyzeSuccess };
}
