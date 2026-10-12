import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập · POD Text QA",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>POD Text QA</CardTitle>
          <CardDescription>Đăng nhập bằng tài khoản chung của team.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* LoginForm reads ?next= via useSearchParams, which needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
