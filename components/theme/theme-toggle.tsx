"use client";

import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ThemeChoice = "system" | "light" | "dark";

const CHOICES: Record<ThemeChoice, { label: string; icon: LucideIcon; next: ThemeChoice }> = {
  system: { label: "Theo hệ thống", icon: MonitorIcon, next: "light" },
  light: { label: "Sáng", icon: SunIcon, next: "dark" },
  dark: { label: "Tối", icon: MoonIcon, next: "system" },
};

function isChoice(value: string | undefined): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

// true only after hydration: the stored theme is unknown on the server.
const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/** Shows the current theme (icon + tooltip) and cycles Theo hệ thống → Sáng → Tối. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current: ThemeChoice = mounted && isChoice(theme) ? theme : "system";
  const { label, icon: Icon, next } = CHOICES[current];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(next)}
            aria-label={`Giao diện: ${label}. Bấm để chuyển sang ${CHOICES[next].label}.`}
            data-theme-choice={current}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {/* One text run: the tooltip content is a flex container. */}
        <span className="whitespace-nowrap">
          Giao diện: <span className="font-medium">{label}</span>
          <span className="opacity-70"> · bấm để chuyển sang {CHOICES[next].label}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
