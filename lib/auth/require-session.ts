import { cookies } from "next/headers";
import { isValidSessionToken, SESSION_COOKIE } from "./session";

export const UNAUTHORIZED_MESSAGE = "Chưa đăng nhập hoặc phiên đã hết hạn.";

/** Every API route checks the session itself; the proxy is not the only line of defense. */
export async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSessionToken(token);
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
}
