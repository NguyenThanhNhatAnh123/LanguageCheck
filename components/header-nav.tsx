"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Kiểm tra" },
  { href: "/dictionary", label: "Từ điển" },
  { href: "/usage", label: "Chi phí" },
];

export function HeaderNav({ showDevLinks }: { showDevLinks: boolean }) {
  const pathname = usePathname();
  const links = showDevLinks ? [...LINKS, { href: "/lt-test", label: "Thử LanguageTool" }] : LINKS;

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Điều hướng chính">
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring rounded-md px-2 py-1 transition-colors duration-150",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
