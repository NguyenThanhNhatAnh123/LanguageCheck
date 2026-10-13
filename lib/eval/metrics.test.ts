import { describe, expect, it } from "vitest";
import { evaluateCriteria, formatRate, normalizeText, parseExpectedError, summarize, summarizeByLanguage, type EvalCase } from "./metrics";

const c = (expectedError: boolean, status: EvalCase["status"], extra: Partial<EvalCase> = {}): EvalCase => ({
  file: "x.png",
  expectedError,
  expectedText: null,
  status,
  correctedText: status === null ? null : "",
  language: null,
  ...extra,
});

describe("summarize", () => {
  it("computes detection and false alarm rates, lenient and strict", () => {
    const summary = summarize([
      c(true, "error"),
      c(true, "warning"),
      c(true, "ok"),
      c(false, "ok"),
      c(false, "warning"),
      c(false, "no_text"),
      c(true, null),
    ]);
    expect(summary.cases).toBe(7);
    expect(summary.failed).toBe(1);
    expect(summary.detection).toEqual({ hits: 2, total: 3, rate: 2 / 3 });
    expect(summary.detectionStrict).toEqual({ hits: 1, total: 3, rate: 1 / 3 });
    expect(summary.falseAlarm).toEqual({ hits: 1, total: 3, rate: 1 / 3 });
    expect(summary.falseAlarmStrict).toEqual({ hits: 0, total: 3, rate: 0 });
  });

  it("compares corrected text ignoring case and spacing", () => {
    const summary = summarize([
      c(true, "error", { expectedText: "YOU'RE THE BEST", correctedText: "you're  the\nbest" }),
      c(true, "error", { expectedText: "NUR FÜR DICH", correctedText: "NUR FUR DICH" }),
      c(false, "ok"),
    ]);
    expect(summary.textMatch).toEqual({ hits: 1, total: 2, rate: 0.5 });
  });

  it("has no rate when there is nothing to measure", () => {
    expect(summarize([]).detection.rate).toBeNull();
  });
});

describe("parseExpectedError", () => {
  it("accepts English and Vietnamese yes/no values", () => {
    expect(["yes", "1", "TRUE", "có", "x"].map(parseExpectedError)).toEqual([true, true, true, true, true]);
    expect(["no", "0", "false", "không", ""].map(parseExpectedError)).toEqual([false, false, false, false, false]);
    expect(parseExpectedError("maybe")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats rates as percentages with counts", () => {
    expect(formatRate({ hits: 2, total: 3, rate: 2 / 3 })).toBe("66.7% (2/3)");
    expect(formatRate({ hits: 0, total: 0, rate: null })).toBe("—");
  });

  it("normalizes text", () => {
    expect(normalizeText("  Hello\n  World ")).toBe("hello world");
  });
});

describe("summarizeByLanguage", () => {
  it("groups by language, main languages first, unknown last", () => {
    const groups = summarizeByLanguage([
      c(true, "error", { language: "en-US" }),
      c(false, "ok"),
      c(true, "ok", { language: "es-ES" }),
      c(true, "error", { language: "de-DE" }),
      c(false, "warning", { language: "de-DE" }),
    ]);
    expect(groups.map((g) => g.language)).toEqual(["de-DE", "es-ES", "en-US", "(không ghi)"]);
    expect(groups[0].summary.detection).toEqual({ hits: 1, total: 1, rate: 1 });
    expect(groups[0].summary.falseAlarm).toEqual({ hits: 1, total: 1, rate: 1 });
    expect(groups[1].summary.detection).toEqual({ hits: 0, total: 1, rate: 0 });
  });
});

describe("evaluateCriteria", () => {
  const de = (expectedError: boolean, status: EvalCase["status"], extra: Partial<EvalCase> = {}) => c(expectedError, status, { language: "de-DE", ...extra });

  it("passes a clean run", () => {
    const report = evaluateCriteria(
      [
        de(true, "error", { mustBeError: true, expectedText: "FÜR IMMER", correctedText: "FÜR IMMER" }),
        de(false, "ok", { expectedText: "FUER IMMER", correctedText: "FUER IMMER" }),
        de(false, "warning"),
        de(false, "warning"),
      ],
      3600,
    );
    expect(report.pass).toBe(true);
  });

  it("fails on a clean image in Lỗi, too many warnings, a miss, a must-error warning, broken text and slowness", () => {
    const report = evaluateCriteria(
      [
        de(false, "error", { file: "clean-error.png" }),
        de(false, "warning", { file: "w1.png" }),
        de(false, "warning", { file: "w2.png" }),
        de(false, "warning", { file: "w3.png" }),
        de(true, "ok", { file: "missed.png" }),
        de(true, "warning", { file: "ano.png", mustBeError: true }),
        de(true, "error", { file: "fu.png", expectedText: "FÜR IMMER", correctedText: "FU IMMER" }),
      ],
      16_000,
    );
    expect(report.pass).toBe(false);
    const [german] = report.byLanguage;
    expect(german.criteria.map((r) => r.pass)).toEqual([false, false, false, false, false]);
    expect(german.criteria[2].failures).toEqual(["missed.png: bỏ sót (kết quả ok)"]);
    expect(german.criteria[3].failures).toEqual(["ano.png: phải là Lỗi (kết quả warning)"]);
    expect(german.criteria[4].failures[0]).toContain('ra "FU IMMER"');
    expect(report.overall[0].pass).toBe(false);
  });

  it("applies the detection criteria to de/fr/es only", () => {
    const report = evaluateCriteria([c(true, "ok", { language: "en-US" })], 1000);
    expect(report.byLanguage[0].criteria.map((r) => r.label)).not.toContain("Mọi lỗi cố ý ở Lỗi hoặc Nghi ngờ");
    expect(report.pass).toBe(true);
  });
});
