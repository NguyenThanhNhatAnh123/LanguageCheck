import { connection } from "next/server";
import { hasValidSession, unauthorizedResponse } from "@/lib/auth/require-session";

// Cheap "am I still logged in?" check, polled by the client while the upload queue is
// paused on an expired session, so it can resume on its own after re-login.
export async function GET() {
  await connection();
  if (!(await hasValidSession())) return unauthorizedResponse();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
