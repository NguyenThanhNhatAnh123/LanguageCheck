"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light/dark follows the operating system by default; the header toggle can override it. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
