import { z } from "zod";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { checkRaw, LanguageToolError } from "@/lib/languagetool";
import { LANGUAGES } from "@/lib/languages";

const ltTestSchema = z.object({
  text: z.string().min(1).max(20_000),
  language: z.enum(LANGUAGES),
});

// Dev-only helper behind /lt-test.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  if (!(await hasValidSession())) return unauthorizedResponse();

  const parsed = ltTestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  try {
    return Response.json(await checkRaw(parsed.data.text, parsed.data.language));
  } catch (error) {
    const reason = error instanceof LanguageToolError ? error.message : "unknown error";
    return Response.json({ error: `Không gọi được LanguageTool (${reason}).` }, { status: 502 });
  }
}
