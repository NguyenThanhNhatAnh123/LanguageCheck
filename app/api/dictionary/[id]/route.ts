import { z } from "zod";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { deleteDictionaryWord } from "@/lib/dictionary/repository";

const idSchema = z.coerce.number().int().positive();

export async function DELETE(_request: Request, { params }: RouteContext<"/api/dictionary/[id]">) {
  if (!(await hasValidSession())) return unauthorizedResponse();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Mã từ không hợp lệ." }, { status: 400 });
  if (!deleteDictionaryWord(id.data)) return Response.json({ error: "Không tìm thấy từ này." }, { status: 404 });
  return new Response(null, { status: 204 });
}
