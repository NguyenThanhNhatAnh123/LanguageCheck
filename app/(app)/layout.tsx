import { ScanTextIcon } from "lucide-react";
import Link from "next/link";
import { HeaderNav } from "@/components/header-nav";
import { LogoutButton } from "@/components/logout-button";
import { LtStatusBadge } from "@/components/lt-status-badge";
import { SessionExpiredBanner } from "@/components/session/session-expired-banner";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="focus-ring flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight">
            <ScanTextIcon className="size-4" aria-hidden />
            <span className="hidden sm:inline">POD Text QA</span>
          </Link>
          <HeaderNav showDevLinks={isDev} />
          <div className="ml-auto flex items-center gap-1.5">
            <LtStatusBadge />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <SessionExpiredBanner />
        {children}
      </main>
    </>
  );
}
