import { describe, expect, it } from "vitest";
import { applyCaseStyle, caseStyleOf, differsOnlyByAccents, isAllCaps } from "./text-case";

describe("caseStyleOf", () => {
  it("detects upper, capitalized and lower originals", () => {
    expect(caseStyleOf("YOUR", "YOUR THE BEST")).toBe("upper");
    expect(caseStyleOf("Your", "Your the best")).toBe("capitalized");
    expect(caseStyleOf("your", "your the best")).toBe("lower");
  });

  it("decides a single capital letter from the block", () => {
    expect(caseStyleOf("A", "A apple a day")).toBe("capitalized");
    expect(caseStyleOf("A", "A APPLE A DAY")).toBe("upper");
  });

  it("treats mixed case as other", () => {
    expect(caseStyleOf("McDonald", "McDonald farm")).toBe("other");
  });

  it("ignores digits and punctuation", () => {
    expect(caseStyleOf("YOU'RE!", "x")).toBe("upper");
    expect(caseStyleOf("2024", "x")).toBe("other");
  });
});

describe("applyCaseStyle", () => {
  it("rewrites suggestions in the original's style", () => {
    expect(applyCaseStyle("you're", "upper")).toBe("YOU'RE");
    expect(applyCaseStyle("you're", "capitalized")).toBe("You're");
    expect(applyCaseStyle("YOU'RE", "lower")).toBe("you're");
    expect(applyCaseStyle("you are", "capitalized")).toBe("You are");
  });

  it("leaves 'other' untouched", () => {
    expect(applyCaseStyle("McDonald's", "other")).toBe("McDonald's");
  });

  it("uppercases ß as SS for German", () => {
    expect(applyCaseStyle("straße", "upper", "de-DE")).toBe("STRASSE");
  });

  it("keeps accents when uppercasing French", () => {
    expect(applyCaseStyle("été", "upper", "fr-FR")).toBe("ÉTÉ");
  });
});

describe("isAllCaps", () => {
  it("needs at least one cased letter, all uppercase", () => {
    expect(isAllCaps("NUR FÜR DICH!")).toBe(true);
    expect(isAllCaps("Nur für dich")).toBe(false);
    expect(isAllCaps("2024 !!!")).toBe(false);
  });
});

describe("differsOnlyByAccents", () => {
  it("is true for the same letters with different accents", () => {
    expect(differsOnlyByAccents("ETE", "ÉTÉ")).toBe(true);
    expect(differsOnlyByAccents("TU", "TÚ")).toBe(true);
    expect(differsOnlyByAccents("FUR", "FÜR")).toBe(true);
  });

  it("is false for different letters or identical strings", () => {
    expect(differsOnlyByAccents("ETE", "ETC")).toBe(false);
    expect(differsOnlyByAccents("ETE", "ete")).toBe(false);
  });
});
