import type { AnalysisStatus } from "@/lib/analysis/types";

// Scoring for `npm run eval`: compares each test image's status with expected.csv.
// "Flagged" means the image reaches the user: status error or warning.

export interface EvalCase {
  file: string;
  expectedError: boolean;
  /** Correct text on the design, when expected.csv provides it. */
  expectedText: string | null;
  /** null when the analysis failed. */
  status: AnalysisStatus | null;
  /** All blocks' "Chữ sau khi sửa", joined. null when the analysis failed. */
  correctedText: string | null;
  /** Language of the design, from expected.csv's optional "language" column. */
  language: string | null;
}

export interface Rate {
  hits: number;
  total: number;
  /** hits / total, or null when total is 0. */
  rate: number | null;
}

export interface EvalSummary {
  cases: number;
  failed: number;
  /** Images with real errors that were flagged (error or warning). */
  detection: Rate;
  /** Same, counting only status "error". */
  detectionStrict: Rate;
  /** Clean images that were flagged anyway (error or warning). */
  falseAlarm: Rate;
  /** Same, counting only status "error". */
  falseAlarmStrict: Rate;
  /** "Chữ sau khi sửa" equals the expected text (case and spacing ignored). */
  textMatch: Rate;
}

function rate(hits: number, total: number): Rate {
  return { hits, total, rate: total === 0 ? null : hits / total };
}

export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

const YES = new Set(["yes", "y", "1", "true", "x", "có", "co", "loi", "lỗi", "error"]);
const NO = new Set(["no", "n", "0", "false", "", "không", "khong", "ok"]);

/** Reads the has_error column; null when the value is not recognized. */
export function parseExpectedError(value: string): boolean | null {
  const normalized = value.trim().toLocaleLowerCase();
  if (YES.has(normalized)) return true;
  if (NO.has(normalized)) return false;
  return null;
}

export function summarize(cases: readonly EvalCase[]): EvalSummary {
  const done = cases.filter((c) => c.status !== null);
  const withError = done.filter((c) => c.expectedError);
  const clean = done.filter((c) => !c.expectedError);
  const flagged = (c: EvalCase) => c.status === "error" || c.status === "warning";
  const withText = done.filter((c) => c.expectedText !== null && c.correctedText !== null);

  return {
    cases: cases.length,
    failed: cases.length - done.length,
    detection: rate(withError.filter(flagged).length, withError.length),
    detectionStrict: rate(withError.filter((c) => c.status === "error").length, withError.length),
    falseAlarm: rate(clean.filter(flagged).length, clean.length),
    falseAlarmStrict: rate(clean.filter((c) => c.status === "error").length, clean.length),
    textMatch: rate(
      withText.filter((c) => normalizeText(c.correctedText ?? "") === normalizeText(c.expectedText ?? "")).length,
      withText.length,
    ),
  };
}

/** Languages first in this order (the tool's main ones first), then any others, then unknown. */
const LANGUAGE_ORDER = ["de-DE", "fr-FR", "es-ES", "en-US"];
export const UNKNOWN_LANGUAGE = "(không ghi)";

/** summarize() per language, for the per-language report. */
export function summarizeByLanguage(cases: readonly EvalCase[]): Array<{ language: string; summary: EvalSummary }> {
  const groups = new Map<string, EvalCase[]>();
  for (const c of cases) {
    const key = c.language ?? UNKNOWN_LANGUAGE;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rank = (language: string) => {
    const index = LANGUAGE_ORDER.indexOf(language);
    if (index !== -1) return index;
    return language === UNKNOWN_LANGUAGE ? LANGUAGE_ORDER.length + 1 : LANGUAGE_ORDER.length;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([language, group]) => ({ language, summary: summarize(group) }));
}

export function formatRate(value: Rate): string {
  if (value.rate === null) return "—";
  return `${(value.rate * 100).toFixed(1)}% (${value.hits}/${value.total})`;
}
