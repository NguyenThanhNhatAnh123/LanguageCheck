import { describe, expect, it } from "vitest";
import type { ClaudeBlock } from "@/lib/claude/schema";
import {
  applyLtLanguageRules,
  groupBlocksByLanguage,
  ltLabelVi,
  ltSeverity,
  mapMatchToBlock,
  type RawLtMatch,
} from "./languagetool-rules";
import type { LtBlockMatch } from "./types";

const block = (index: number, text: string, language: ClaudeBlock["language"]): ClaudeBlock => ({
  index,
  text,
  role: "headline",
  language,
  legibility: "clear",
});

const raw = (offset: number, length: number, issueType = "misspelling", replacements: string[] = []): RawLtMatch => ({
  offset,
  length,
  message: "msg",
  replacements: replacements.map((value) => ({ value })),
  rule: { id: "RULE", issueType, category: { id: "TYPOS" } },
});

describe("groupBlocksByLanguage", () => {
  it("joins blocks of one language with \\n and skips unknown", () => {
    const groups = groupBlocksByLanguage([
      block(0, "NUR FUR DICH", "de-DE"),
      block(1, "LOVE", "en-US"),
      block(2, "HANDGEMACHT", "de-DE"),
      block(3, "XYZ", "unknown"),
    ]);
    expect(groups.map((g) => [g.language, g.text])).toEqual([
      ["en-US", "LOVE"],
      ["de-DE", "NUR FUR DICH\nHANDGEMACHT"],
    ]);
    expect(groups[1].segments).toEqual([
      { blockIndex: 0, start: 0, end: 12 },
      { blockIndex: 2, start: 13, end: 24 },
    ]);
  });
});

describe("mapMatchToBlock", () => {
  const [group] = groupBlocksByLanguage([block(0, "TU ERES\nMI VIDA", "es-ES"), block(1, "TE QUIERO MAS", "es-ES")]);

  it("maps offsets back to the right block (multi-line blocks included)", () => {
    // "TU ERES\nMI VIDA\nTE QUIERO MAS": MAS starts at 26 → block 1 offset 10.
    expect(mapMatchToBlock(group, raw(26, 3))).toMatchObject({ blockIndex: 1, start: 10, end: 13 });
    expect(mapMatchToBlock(group, raw(0, 2))).toMatchObject({ blockIndex: 0, start: 0, end: 2 });
  });

  it("clips a match that runs past its block", () => {
    expect(mapMatchToBlock(group, raw(12, 10))).toMatchObject({ blockIndex: 0, start: 12, end: 15 });
  });

  it("ignores a match starting on the separator", () => {
    expect(mapMatchToBlock(group, raw(15, 1))).toBeNull();
  });
});

describe("ltSeverity and ltLabelVi", () => {
  it("maps issueType to severity", () => {
    expect(["misspelling", "grammar", "duplication"].map(ltSeverity)).toEqual(["error", "error", "error"]);
    expect(["typographical", "style", "whitespace"].map(ltSeverity)).toEqual(["info", "info", "info"]);
    expect(["uncategorized", "inconsistency", null].map(ltSeverity)).toEqual(["warning", "warning", "warning"]);
  });

  it("labels LanguageTool-only issues in Vietnamese", () => {
    expect(ltLabelVi("misspelling")).toBe("Lỗi chính tả");
    expect(ltLabelVi("grammar")).toBe("Lỗi ngữ pháp");
    expect(ltLabelVi("duplication")).toBe("Lặp từ");
    expect(ltLabelVi("typographical")).toBe("Lỗi dấu câu/trình bày");
    expect(ltLabelVi("style")).toBe("Cần xem lại");
    expect(ltLabelVi(null)).toBe("Cần xem lại");
  });
});

describe("applyLtLanguageRules", () => {
  const match = (start: number, end: number, extra: Partial<LtBlockMatch> = {}): LtBlockMatch => ({
    blockIndex: 0,
    start,
    end,
    message: "msg",
    issueType: "misspelling",
    ruleId: "R",
    categoryId: "TYPOS",
    replacements: [],
    ...extra,
  });

  it("de-DE ALL CAPS: drops noun-capitalization matches", () => {
    const b = block(0, "ICH LIEBE DICH", "de-DE");
    expect(applyLtLanguageRules(match(4, 9, { categoryId: "CASING", replacements: ["Liebe"] }), b, "de-DE")).toEqual({ action: "drop" });
  });

  it("de-DE ALL CAPS: SS for ß is valid", () => {
    const b = block(0, "DIE GROSSE STRASSE", "de-DE");
    expect(applyLtLanguageRules(match(11, 18, { replacements: ["STRAßE"] }), b, "de-DE")).toEqual({ action: "drop" });
  });

  it("de-DE: a missing umlaut stays an error", () => {
    const b = block(0, "NUR FUR DICH", "de-DE");
    expect(applyLtLanguageRules(match(4, 7, { replacements: ["FU", "VfR"] }), b, "de-DE")).toEqual({ action: "keep", severity: "error" });
  });

  it("de-DE: AE/OE/UE for Ä/Ö/Ü is valid, in caps and lowercase", () => {
    expect(applyLtLanguageRules(match(0, 4, { replacements: ["FÜR", "FEUER"] }), block(0, "FUER IMMER", "de-DE"), "de-DE")).toEqual({ action: "drop" });
    expect(applyLtLanguageRules(match(10, 17, { replacements: ["MÜTTER"] }), block(0, "DIE BESTE MUETTER", "de-DE"), "de-DE")).toEqual({ action: "drop" });
    expect(applyLtLanguageRules(match(4, 10, { replacements: ["schön"] }), block(0, "ein schoen Tag", "de-DE"), "de-DE")).toEqual({ action: "drop" });
  });

  it("de-DE mixed case: casing matches are kept", () => {
    const b = block(0, "ich liebe dich", "de-DE");
    expect(applyLtLanguageRules(match(0, 3, { categoryId: "CASING", issueType: "typographical", replacements: ["Ich"] }), b, "de-DE")).toEqual({ action: "keep", severity: "info" });
  });

  it("fr-FR: a missing space before ! is info", () => {
    const b = block(0, "Bonne journée!", "fr-FR");
    expect(applyLtLanguageRules(match(13, 14, { issueType: "grammar", replacements: [" !"] }), b, "fr-FR")).toEqual({ action: "keep", severity: "info" });
  });

  it("es-ES: missing ¿ is a warning even if LanguageTool calls it typographical", () => {
    const b = block(0, "QUE PASA?", "es-ES");
    expect(applyLtLanguageRules(match(0, 3, { issueType: "typographical", replacements: ["¿QUE"] }), b, "es-ES")).toEqual({ action: "keep", severity: "warning" });
  });

  it("es-ES: a meaning-changing missing accent is an error", () => {
    const b = block(0, "TU ERES MI VIDA", "es-ES");
    expect(applyLtLanguageRules(match(0, 2, { issueType: "uncategorized", replacements: ["TÚ"] }), b, "es-ES")).toEqual({ action: "keep", severity: "error" });
  });

  it("es-ES: a missing Ñ is an error whatever LanguageTool calls it", () => {
    const b = block(0, "FELIZ CUMPLEANOS", "es-ES");
    expect(applyLtLanguageRules(match(6, 16, { issueType: "uncategorized", replacements: ["CUMPLEAÑOS"] }), b, "es-ES")).toEqual({ action: "keep", severity: "error" });
  });

  it("drops matches on Claude's [?] placeholder", () => {
    const b = block(0, "BORN TO R[?]DE", "en-US");
    expect(applyLtLanguageRules(match(8, 14), b, "en-US")).toEqual({ action: "drop" });
  });
});
