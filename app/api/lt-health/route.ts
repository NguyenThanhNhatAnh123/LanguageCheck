import { connection } from "next/server";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";
import { isLanguageToolOnline } from "@/lib/languagetool";
import { recordLanguageToolHealth } from "@/lib/languagetool-warmup";

export async function GET() {
  // Must come first and outside any try/catch, so the route is never prerendered at build time.
  await connection();
  if (!(await hasValidSession())) return unauthorizedResponse();

  const online = await isLanguageToolOnline();
  recordLanguageToolHealth(online);

  return Response.json(
    { status: online ? "online" : "offline" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
