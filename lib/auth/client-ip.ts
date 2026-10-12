// Cloudflare Tunnel sets CF-Connecting-IP to the real client IP. The app only listens on
// 127.0.0.1, so the header cannot be spoofed by bypassing Cloudflare.
export function getClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
