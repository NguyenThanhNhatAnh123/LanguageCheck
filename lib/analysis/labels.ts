import type { Severity } from "@/lib/claude/schema";
import { isLanguage, LANGUAGE_LABELS } from "@/lib/languages";
import type { AnalysisResult, AnalysisStatus, IssueSource } from "./types";

// Vietnamese labels for the UI.

export const STATUS_LABELS: Record<AnalysisStatus, string> = {
  error: "Lỗi",
  warning: "Nghi ngờ",
  ok: "Không lỗi",
  no_text: "Không có chữ",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "Lỗi",
  warning: "Nghi ngờ",
  info: "Ghi chú",
};

export function sourceLabel(sources: readonly IssueSource[]): string {
  if (sources.includes("claude") && sources.includes("lt")) return "Cả 2";
  return sources.includes("lt") ? "LanguageTool" : "Claude";
}

export function languageLabel(language: AnalysisResult["language"] | string): string {
  if (isLanguage(language)) return LANGUAGE_LABELS[language];
  if (language === "mixed") return "Nhiều ngôn ngữ";
  return "Không rõ ngôn ngữ";
}
