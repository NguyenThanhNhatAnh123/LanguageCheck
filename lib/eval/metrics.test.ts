import { describe, expect, it } from "vitest";
import { formatRate, normalizeText, parseExpectedError, summarize, type EvalCase } from "./metrics";

const c = (expectedError: boolean, status: EvalCase["status"], extra: Partial<EvalCase> = {}): EvalCase => ({
  file: "x.png",
  expectedError,
  expectedText: null,
  status,
  correctedText: status === null ? null : "",
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
