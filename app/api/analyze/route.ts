import { z } from "zod";
import { analyzeMockup } from "@/lib/analysis/analyze-mockup";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { ClaudeConfigError } from "@/lib/claude/config";
import { getClaudeRuntime, type ClaudeRuntime } from "@/lib/claude";
import { ACCEPTED_IMAGE_TYPES, type ImageMediaType } from "@/lib/claude/transport";

// Client resizes to ≤1000px JPEG (~100–400 KB); anything far above that is not a resized mockup.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const fileNameSchema = z.string().trim().min(1).max(500);

function isAcceptedType(type: string): type is ImageMediaType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

// The image stays in memory for the duration of the request: never written to disk,
// never stored, never logged (neither are the file name or the text read from it).
export async function POST(request: Request) {
  if (!(await hasValidSession())) return unauthorizedResponse();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Dữ liệu tải lên không hợp lệ." }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return Response.json({ error: "Thiếu ảnh." }, { status: 400 });
  }
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Ảnh rỗng hoặc quá lớn (tối đa 5 MB sau khi thu nhỏ)." }, { status: 413 });
  }
  if (!isAcceptedType(image.type)) {
    return Response.json({ error: "Chỉ nhận ảnh JPEG, PNG hoặc WebP." }, { status: 415 });
  }
  // The resized upload loses its name, so the client sends the original one separately.
  const fileName = fileNameSchema.safeParse(form.get("fileName") ?? image.name);
  if (!fileName.success) {
    return Response.json({ error: "Tên file không hợp lệ." }, { status: 400 });
  }

  let runtime: ClaudeRuntime;
  try {
    runtime = getClaudeRuntime();
  } catch (error) {
    if (error instanceof ClaudeConfigError) console.error(`[claude] ${error.message}`);
    return Response.json({ error: "Máy chủ chưa cấu hình Claude. Báo người quản trị." }, { status: 500 });
  }

  const response = await analyzeMockup(
    { data: Buffer.from(await image.arrayBuffer()), mediaType: image.type, fileName: fileName.data },
    runtime,
  );
  return Response.json(response);
}
