import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { parseDictionaryCsv } from "@/lib/dictionary/csv";
import { importDictionaryWords } from "@/lib/dictionary/repository";

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_ROWS = 5000;

export async function POST(request: Request) {
  if (!(await hasValidSession())) return unauthorizedResponse();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Dữ liệu tải lên không hợp lệ." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Chưa chọn file CSV." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return Response.json({ error: "File CSV quá lớn (tối đa 1 MB)." }, { status: 413 });
  }

  const parsed = parseDictionaryCsv(await file.text());
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
  if (parsed.rows.length > MAX_ROWS) {
    return Response.json({ error: `File có quá nhiều dòng (tối đa ${MAX_ROWS}).` }, { status: 413 });
  }

  const summary = importDictionaryWords(parsed.rows);
  return Response.json({ ...summary, invalidLines: parsed.invalidLines });
}
