import { connection } from "next/server";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { toDictionaryEntryDto } from "@/lib/dictionary/dto";
import { dictionaryWordInputSchema } from "@/lib/dictionary/input";
import { addDictionaryWord, listDictionaryEntries } from "@/lib/dictionary/repository";

export async function GET() {
  await connection();
  if (!(await hasValidSession())) return unauthorizedResponse();
  return Response.json(
    { entries: listDictionaryEntries().map(toDictionaryEntryDto) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await hasValidSession())) return unauthorizedResponse();
  const parsed = dictionaryWordInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Từ không hợp lệ: chọn ngôn ngữ và nhập 1 từ (tối đa 100 ký tự)." }, { status: 400 });
  }
  const { created, entry } = addDictionaryWord(parsed.data);
  return Response.json({ created, entry: toDictionaryEntryDto(entry) }, { status: created ? 201 : 200 });
}
