import { z } from "zod";
import type { DictionaryEntryDto } from "@/lib/dictionary/dto";
import { LANGUAGES, type Language } from "@/lib/languages";

// Browser-side calls to /api/dictionary*.

const entrySchema = z.object({
  id: z.number(),
  language: z.enum(LANGUAGES),
  word: z.string(),
  wordKey: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
const listSchema = z.object({ entries: z.array(entrySchema) });
const addSchema = z.object({ created: z.boolean(), entry: entrySchema });
const importSchema = z.object({ created: z.number(), existing: z.number(), invalidLines: z.array(z.number()) });
const errorSchema = z.object({ error: z.string() });

export class DictionaryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DictionaryApiError";
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
}

async function call<T>(input: string, init: RequestInit, schema: z.ZodType<T> | null): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(input, { cache: "no-store", ...init });
  } catch {
    throw new DictionaryApiError("Mất kết nối tới máy chủ.", 0);
  }
  if (response.status === 204) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new DictionaryApiError(parsed.success ? parsed.data.error : `Máy chủ lỗi (HTTP ${response.status}).`, response.status);
  }
  if (!schema) return null;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DictionaryApiError("Máy chủ trả về dữ liệu không hợp lệ.", response.status);
  return parsed.data;
}

export async function fetchDictionary(): Promise<DictionaryEntryDto[]> {
  const result = await call("/api/dictionary", {}, listSchema);
  return result?.entries ?? [];
}

export async function addDictionaryWord(input: { language: Language; word: string; note?: string | null }) {
  const result = await call(
    "/api/dictionary",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    addSchema,
  );
  if (!result) throw new DictionaryApiError("Máy chủ trả về dữ liệu không hợp lệ.", 0);
  return result;
}

export async function deleteDictionaryWord(id: number): Promise<void> {
  await call(`/api/dictionary/${id}`, { method: "DELETE" }, null);
}

export async function importDictionaryCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  const result = await call("/api/dictionary/import", { method: "POST", body: form }, importSchema);
  if (!result) throw new DictionaryApiError("Máy chủ trả về dữ liệu không hợp lệ.", 0);
  return result;
}
