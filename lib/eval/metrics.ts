import type { AnalysisStatus } from "@/lib/analysis/types";
import { isUncheckedLanguage } from "@/lib/languages";

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
  /** From the optional "must_error" column: this error must reach status "error", not just "warning". */
  mustBeError?: boolean;
  /** What Claude read (all blocks joined), to tell punctuation the tool changed from punctuation misread. */
  transcribedText?: string | null;
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

const lettersAndDigits = (text: string) => normalizeText(text).replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const punctuation = (text: string) => normalizeText(text).replace(/[\p{L}\p{N}\s]/gu, "");

/**
 * "Chữ sau khi sửa" is right: same letters and digits as the answer. Punctuation only counts
 * where the tool changed it (a fix that added a comma); punctuation Claude simply misread,
 * like a decorative colon in AVISO:, is ignored (PLAN.md "Tiêu chí đạt", criterion 3).
 */
export function correctedTextMatches(c: Pick<EvalCase, "correctedText" | "expectedText" | "transcribedText">): boolean {
  if (c.correctedText === null || c.expectedText === null) return false;
  if (lettersAndDigits(c.correctedText) !== lettersAndDigits(c.expectedText)) return false;
  const toolChangedPunctuation = c.transcribedText != null && punctuation(c.transcribedText) !== punctuation(c.correctedText);
  return toolChangedPunctuation ? normalizeText(c.correctedText) === normalizeText(c.expectedText) : true;
}

function rate(hits: number, total: number): Rate {
  return { hits, total, rate: total === 0 ? null : hits / total };
}

/**
 * For comparing "Chữ sau khi sửa" with the answer: case, spacing and typographic variants
 * ignored (J’AI = J'AI, “ME LA SUDA” = "ME LA SUDA", … = ...).
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
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
      withText.filter((c) => correctedTextMatches(c)).length,
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

// ---------------------------------------------------------------------------
// Pass criteria (PLAN.md "Tiêu chí đạt"), checked per language.
// ---------------------------------------------------------------------------

/** The tool's main languages: the detection criteria only apply to them. */
export const MAIN_LANGUAGES = ["de-DE", "fr-FR", "es-ES"];
export const MAX_WARNINGS_ON_CLEAN = 2;
export const MAX_AVERAGE_MS = 15_000;

export interface CriterionResult {
  label: string;
  pass: boolean;
  /** One line per failing case: "<file>: <reason>". */
  failures: string[];
}

export interface CriteriaReport {
  pass: boolean;
  byLanguage: Array<{ language: string; pass: boolean; criteria: CriterionResult[] }>;
  /** Criteria over the whole run (average time). */
  overall: CriterionResult[];
}

function criterion(label: string, failures: string[], pass = failures.length === 0): CriterionResult {
  return { label, pass, failures };
}

function languageCriteria(language: string, cases: readonly EvalCase[]): CriterionResult[] {
  const clean = cases.filter((c) => !c.expectedError);
  const withError = cases.filter((c) => c.expectedError);
  const statusLabel = (c: EvalCase) => (c.status === null ? "phân tích thất bại" : `kết quả ${c.status}`);

  const cleanWarnings = clean.filter((c) => c.status === "warning");
  const results = [
    criterion("Không ảnh đúng nào bị xếp Lỗi", clean.filter((c) => c.status === "error").map((c) => `${c.file}: ảnh đúng bị xếp Lỗi`)),
    criterion(
      `Nghi ngờ trên ảnh đúng ≤ ${MAX_WARNINGS_ON_CLEAN}`,
      cleanWarnings.map((c) => `${c.file}: ảnh đúng bị xếp Nghi ngờ`),
      cleanWarnings.length <= MAX_WARNINGS_ON_CLEAN,
    ),
  ];
  if (MAIN_LANGUAGES.includes(language)) {
    results.push(
      criterion(
        "Mọi lỗi cố ý ở Lỗi hoặc Nghi ngờ",
        withError.filter((c) => c.status !== "error" && c.status !== "warning").map((c) => `${c.file}: bỏ sót (${statusLabel(c)})`),
      ),
      criterion(
        "Ca bắt buộc (ANO, FUR, sai giống/số…) ở Lỗi",
        withError.filter((c) => c.mustBeError && c.status !== "error").map((c) => `${c.file}: phải là Lỗi (${statusLabel(c)})`),
      ),
    );
  }
  if (isUncheckedLanguage(language)) {
    results.push(
      criterion(
        "Ảnh chữ không kiểm (tiếng Anh) ở Nghi ngờ",
        cases.filter((c) => c.status !== "warning").map((c) => `${c.file}: phải là Nghi ngờ (${statusLabel(c)})`),
      ),
    );
  }
  results.push(
    criterion(
      "Chữ sau khi sửa đúng ở mọi ca",
      cases
        .filter((c) => c.expectedText !== null)
        .filter((c) => !correctedTextMatches(c))
        .map((c) =>
          c.correctedText === null
            ? `${c.file}: phân tích thất bại`
            : `${c.file}: ra ${JSON.stringify(c.correctedText)}, đáp án ${JSON.stringify(c.expectedText)}`,
        ),
    ),
  );
  return results;
}

/** Checks the pass criteria per language, plus the average time per image. */
export function evaluateCriteria(cases: readonly EvalCase[], averageMs: number): CriteriaReport {
  const byLanguage = summarizeByLanguage(cases).map(({ language }) => {
    const criteria = languageCriteria(language, cases.filter((c) => (c.language ?? UNKNOWN_LANGUAGE) === language));
    return { language, pass: criteria.every((c) => c.pass), criteria };
  });
  const overall = [
    criterion(`Trung bình < ${MAX_AVERAGE_MS / 1000} s/ảnh`, averageMs < MAX_AVERAGE_MS ? [] : [`trung bình ${(averageMs / 1000).toFixed(1)} s/ảnh`]),
  ];
  return { pass: byLanguage.every((l) => l.pass) && overall.every((c) => c.pass), byLanguage, overall };
}

export function formatRate(value: Rate): string {
  if (value.rate === null) return "—";
  return `${(value.rate * 100).toFixed(1)}% (${value.hits}/${value.total})`;
}
