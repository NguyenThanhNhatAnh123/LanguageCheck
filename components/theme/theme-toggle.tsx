"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const NEXT: Record<string, string> = { system: "light", light: "dark", dark: "system" };
const LABELS: Record<string, string> = {
  system: "Giao diện: theo hệ thống",
  light: "Giao diện: sáng",
  dark: "Giao diện: tối",
};

// true only after hydration: the stored theme is unknown on the server.
const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/** Cycles theo hệ thống → sáng → tối. */
export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme : "system";
  const Icon = current === "light" ? SunIcon : current === "dark" ? MoonIcon : MonitorIcon;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(NEXT[current] ?? "system")}
      title={`${LABELS[current]} (bấm để đổi)`}
      aria-label={`${LABELS[current]}. Bấm để đổi.`}
    >
      <Icon />
    </Button>
  );
}
