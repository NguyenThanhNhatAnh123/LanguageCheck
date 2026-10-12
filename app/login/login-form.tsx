"use client";

import { Loader2Icon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/safe-next-path";

const errorSchema = z.object({ error: z.string() });

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (response.ok) {
        // Full navigation so the app shell is loaded with the new session cookie.
        window.location.assign(safeNextPath(searchParams.get("next")));
        return;
      }
      const parsed = errorSchema.safeParse(await response.json().catch(() => null));
      setError(parsed.success ? parsed.data.error : "Đăng nhập thất bại. Vui lòng thử lại.");
    } catch {
      setError("Không kết nối được máy chủ. Vui lòng thử lại.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Tên đăng nhập</Label>
        <Input id="username" name="username" autoComplete="username" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
