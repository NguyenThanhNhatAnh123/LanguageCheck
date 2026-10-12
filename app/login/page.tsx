import { ScanTextIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập · POD Text QA",
};

export default function LoginPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-16">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[22rem] space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl border bg-card">
            <ScanTextIcon className="size-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">POD Text QA</h1>
          <p className="text-sm text-muted-foreground">Đăng nhập bằng tài khoản chung của team.</p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          {/* LoginForm reads ?next= via useSearchParams, which needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
