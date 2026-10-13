import { describe, expect, it } from "vitest";
import type { ClaudeBlock } from "@/lib/claude/schema";
import {
  applyLtLanguageRules,
  groupBlocksByLanguage,
  languageToolText,
  ltLabelVi,
  ltSeverity,
  mapMatchToBlock,
  type RawLtMatch,
} from "./languagetool-rules";
import type { LtBlockMatch } from "./types";

const block = (index: number, text: string, language: ClaudeBlock["language"], normalCase: string | null = null): ClaudeBlock => ({
  index,
  text,
  role: "headline",
  language,
  legibility: "clear",
  normal_case: normalCase,
});

const raw = (offset: number, length: number, issueType = "misspelling", replacements: string[] = []): RawLtMatch => ({
  offset,
  length,
  message: "msg",
  replacements: replacements.map((value) => ({ value })),
  rule: { id: "RULE", issueType, category: { id: "TYPOS" } },
});

describe("groupBlocksByLanguage", () => {
  it("joins blocks of one language with \\n and skips unknown and English", () => {
    const groups = groupBlocksByLanguage([
      block(0, "NUR FUR DICH", "de-DE"),
      block(1, "AMOUR", "fr-FR"),
      block(2, "HANDGEMACHT", "de-DE"),
      block(3, "XYZ", "unknown"),
      block(4, "YOUR THE BEST", "en-US"),
    ]);
    expect(groups.map((g) => [g.language, g.text])).toEqual([
      ["de-DE", "NUR FUR DICH\nHANDGEMACHT"],
      ["fr-FR", "AMOUR"],
    ]);
    expect(groups[0].segments).toEqual([
      { blockIndex: 0, start: 0, end: 12 },
      { blockIndex: 2, start: 13, end: 24 },
    ]);
  });
});

describe("languageToolText (Claude's normal_case for ALL CAPS blocks)", () => {
  it("uses normal_case when only the letter case differs", () => {
    expect(languageToolText(block(0, "ICH LIEBE MEINE HUND", "de-DE", "Ich liebe meine Hund"), "de-DE")).toBe("Ich liebe meine Hund");
    expect(languageToolText(block(0, "MAMAN\nPARFAIT", "fr-FR", "Maman\nparfait"), "fr-FR")).toBe("Maman\nparfait");
  });

  it("falls back to the transcription otherwise (null, other letters, other length)", () => {
    expect(languageToolText(block(0, "ICH LIEBE MEINE HUND", "de-DE"), "de-DE")).toBe("ICH LIEBE MEINE HUND");
    expect(languageToolText(block(0, "DIE GROSSE STRASSE", "de-DE", "Die große Straße"), "de-DE")).toBe("DIE GROSSE STRASSE");
    expect(languageToolText(block(0, "MEINE HUND", "de-DE", "Meinen Hund"), "de-DE")).toBe("MEINE HUND");
    expect(languageToolText(block(0, "ABUELA ORGULLOSO", "es-ES", "Abuela orgullosa"), "es-ES")).toBe("ABUELA ORGULLOSO");
  });

  it("accepts normal_case with the lines joined by spaces (same offsets)", () => {
    const text = "ICH BIN KEIN\nMORGENMENSCH\nABER KAFFEE MACHEN\nMICH FAST NETT";
    const normal = "Ich bin kein Morgenmensch aber Kaffee machen mich fast nett";
    expect(languageToolText(block(0, text, "de-DE", normal), "de-DE")).toBe(normal);
  });

  it("groups the normal-case text with the same offsets", () => {
    const [group] = groupBlocksByLanguage([block(0, "EL MEJOR\nMAMÁ", "es-ES", "El mejor\nmamá"), block(1, "TE QUIERO", "es-ES", "Te quiero")]);
    expect(group.text).toBe("El mejor\nmamá\nTe quiero");
    expect(group.segments).toEqual([
      { blockIndex: 0, start: 0, end: 13 },
      { blockIndex: 1, start: 14, end: 23 },
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

  it("drops missing-comma matches (slogans usually have no commas)", () => {
    const fr = block(0, "JE NE SUIS PAS TÊTU J'AI JUSTE RAISON", "fr-FR");
    expect(applyLtLanguageRules(match(19, 22, { issueType: "uncategorized", ruleId: "VIRG_NON_TROUVEE", categoryId: "PONCTUATION_VIRGULE", replacements: [", J'"] }), fr, "fr-FR")).toEqual({ action: "drop" });
    const de = block(0, "ICH BIN NICHT STUR ICH HABE NUR", "de-DE");
    expect(applyLtLanguageRules(match(4, 27, { issueType: "uncategorized", ruleId: "KOMMA_ZWISCHEN_HAUPT_UND_NEBENSATZ", categoryId: "HILFESTELLUNG_KOMMASETZUNG" }), de, "de-DE")).toEqual({ action: "drop" });
  });

  it("drops missing-comma matches found on the normal-case copy of an ALL CAPS block", () => {
    const fr = block(0, "JE NE SUIS PAS TÊTU\nJ'AI JUSTE RAISON", "fr-FR", "Je ne suis pas têtu\nj'ai juste raison");
    expect(applyLtLanguageRules(match(19, 22, { issueType: "uncategorized", ruleId: "VIRG_NON_TROUVEE", replacements: [", j'"] }), fr, "fr-FR")).toEqual({ action: "drop" });
    const de = block(0, "WIR LÖSEN PROBLEME\nVON DENEN DU", "de-DE", "Wir lösen Probleme\nvon denen du");
    expect(applyLtLanguageRules(match(10, 28, { issueType: "uncategorized", ruleId: "KOMMA_REL", replacements: ["Probleme, von denen"] }), de, "de-DE")).toEqual({ action: "drop" });
  });

  it("fr-FR missing space before ! is info also on a normal-case copy", () => {
    const b = block(0, "BONNE JOURNÉE!", "fr-FR", "Bonne journée!");
    expect(applyLtLanguageRules(match(6, 14, { issueType: "typographical", replacements: ["journée !"] }), b, "fr-FR")).toEqual({ action: "keep", severity: "info" });
  });

  it("keeps ¿ ¡ and missing-space matches, which are not about commas", () => {
    expect(applyLtLanguageRules(match(0, 3, { issueType: "typographical", replacements: ["¿QUE"] }), block(0, "QUE PASA?", "es-ES"), "es-ES")).toEqual({ action: "keep", severity: "warning" });
    expect(applyLtLanguageRules(match(13, 14, { issueType: "grammar", replacements: [" !"] }), block(0, "Bonne journée!", "fr-FR"), "fr-FR")).toEqual({ action: "keep", severity: "info" });
  });

  it("drops matches on Claude's [?] placeholder", () => {
    const b = block(0, "FAHR ZUM R[?]DEN", "de-DE");
    expect(applyLtLanguageRules(match(9, 16), b, "de-DE")).toEqual({ action: "drop" });
  });
});
