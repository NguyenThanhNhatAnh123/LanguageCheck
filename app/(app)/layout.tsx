import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { LtStatusBadge } from "@/components/lt-status-badge";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold">
            POD Text QA
          </Link>
          {isDev && (
            <Link href="/lt-test" className="text-sm text-muted-foreground hover:text-foreground">
              Thử LanguageTool
            </Link>
          )}
          <div className="ml-auto flex items-center gap-3">
            <LtStatusBadge />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
