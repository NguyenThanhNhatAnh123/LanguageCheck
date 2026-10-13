import { describe, expect, it } from "vitest";
import type { ClaudeAnalysis, ClaudeIssue } from "@/lib/claude/schema";
import { createDictionaryMatcher } from "@/lib/dictionary/matcher";
import { toWordKey } from "@/lib/dictionary/word-key";
import type { Language } from "@/lib/languages";
import { analyzeTexts, computeStatus, correctedText, findOccurrence, processSuggestions, trimSuggestionContext } from "./pipeline";
import type { Issue, LtBlockMatch, Suggestion } from "./types";

const noDictionary = createDictionaryMatcher([]);

function analysis(language: Language, texts: string[], issues: Array<Partial<ClaudeIssue> & Pick<ClaudeIssue, "original">>): ClaudeAnalysis {
  return {
    has_text: true,
    language,
    blocks: texts.map((text, index) => ({ index, text, role: "headline", language, legibility: "clear" })),
    issues: issues.map((issue) => ({
      block_index: 0,
      occurrence: null,
      type: "spelling",
      severity: "error",
      intentional_possible: false,
      explanation_vi: "giải thích",
      suggestions: [],
      ...issue,
    })),
    notes_vi: null,
  };
}

function lt(blockIndex: number, start: number, end: number, issueType: string, replacements: string[], extra: Partial<LtBlockMatch> = {}): LtBlockMatch {
  return { blockIndex, start, end, message: "LT message", issueType, ruleId: "RULE", categoryId: "TYPOS", replacements, ...extra };
}

const run = (claude: ClaudeAnalysis, ltMatches: LtBlockMatch[] = [], dictionary = noDictionary) =>
  analyzeTexts({ claude, ltMatches, ltStatus: "online" }, dictionary).result;

const sug = (text: string, source: Suggestion["source"] = "claude"): Suggestion => ({ text, noteVi: null, source });

describe("findOccurrence / locating Claude issues", () => {
  it("finds the n-th occurrence", () => {
    expect(findOccurrence("THE BEST THE", "THE", 1)).toBe(0);
    expect(findOccurrence("THE BEST THE", "THE", 2)).toBe(9);
    expect(findOccurrence("THE BEST THE", "THE", 3)).toBe(-1);
  });

  it("uses occurrence (null = 1) to place the issue", () => {
    const result = run(analysis("de-DE", ["DIE KATZE UND DIE MAUS"], [{ original: "DIE", occurrence: 2, suggestions: [{ text: "DER", note_vi: null }] }]));
    expect(result.issues[0]).toMatchObject({ start: 14, end: 17 });
  });

  it("downgrades an issue whose original is not in the block to warning", () => {
    const { result, claudeIssuesNotFound } = analyzeTexts(
      { claude: analysis("de-DE", ["HALLO"], [{ original: "WELT" }]), ltMatches: [], ltStatus: "online" },
      noDictionary,
    );
    expect(claudeIssuesNotFound).toBe(1);
    expect(result.issues[0]).toMatchObject({ severity: "warning", start: null });
    expect(result.status).toBe("warning");
  });
});

describe("merge", () => {
  it("merges overlapping Claude and LanguageTool issues into one with both sources", () => {
    const result = run(
      analysis("de-DE", ["ICH LIEBE MEINE HUND"], [{ original: "MEINE", type: "grammar", suggestions: [{ text: "MEINEN", note_vi: null }] }]),
      [lt(0, 10, 15, "grammar", ["MEINEN"])],
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ sources: ["claude", "lt"], severity: "error", explanationVi: "giải thích", ltMessages: ["LT message"] });
    expect(result.status).toBe("error");
  });

  it("HAB DICH LIEB: Claude intentional wins over LanguageTool misspelling", () => {
    const result = run(
      analysis("de-DE", ["HAB DICH LIEB"], [{ original: "HAB", type: "word_choice", severity: "info", intentional_possible: true, suggestions: [{ text: "HABE", note_vi: null }] }]),
      [lt(0, 0, 3, "misspelling", ["HAT"])],
    );
    expect(result.issues[0]).toMatchObject({ sources: ["claude", "lt"], severity: "info", intentionalPossible: true });
    expect(result.status).toBe("ok");
    expect(result.blocks[0].correctedText).toBe("HAB DICH LIEB");
  });

  it("takes the higher severity when Claude is not intentional", () => {
    const result = run(
      analysis("fr-FR", ["Les petites chose de la vie"], [{ original: "chose", type: "grammar", severity: "warning", suggestions: [{ text: "choses", note_vi: null }] }]),
      [lt(0, 4, 17, "grammar", ["petite chose", "petites choses"])],
    );
    expect(result.issues[0].severity).toBe("error");
  });

  it("re-bases suggestions onto the merged span (petites chose)", () => {
    const result = run(
      analysis("fr-FR", ["Les petites chose\nde la vie"], [{ original: "chose", type: "grammar", suggestions: [{ text: "choses", note_vi: null }] }]),
      [lt(0, 4, 17, "uncategorized", ["petite chose", "petites choses"])],
    );
    const issue = result.issues[0];
    expect(issue.original).toBe("petites chose");
    expect(issue.suggestions.map((s) => s.text)).toEqual(["petites choses", "petite chose"]);
    expect(result.blocks[0].correctedText).toBe("Les petites choses\nde la vie");
  });

  it("keeps LanguageTool-only issues with a Vietnamese label and at most warning status", () => {
    const result = run(analysis("de-DE", ["DIE DIE BESTE MAMA"], []), [lt(0, 0, 7, "duplication", ["DIE"])]);
    expect(result.issues[0]).toMatchObject({ sources: ["lt"], severity: "error", ltLabelVi: "Lặp từ", explanationVi: null });
    expect(result.status).toBe("warning");
  });
});

describe("dictionary filter", () => {
  const dictionary = createDictionaryMatcher([{ language: "de-DE", wordKey: toWordKey("Haida", "de-DE") }]);

  it("removes issues on dictionary words from both sources", () => {
    const claude = analysis("de-DE", ["STOLZ AUF HAIDA"], [{ original: "HAIDA", severity: "warning", intentional_possible: true }]);
    const matches = [lt(0, 10, 15, "misspelling", ["HAIFA"])];
    expect(run(claude, matches).status).toBe("warning");
    const filtered = run(claude, matches, dictionary);
    expect(filtered.issues).toEqual([]);
    expect(filtered.status).toBe("ok");
  });

  it("removes a multi-word spelling issue once every word is in the dictionary", () => {
    const claude = analysis("de-DE", ["HAIDA NATION STOLZ"], [{ original: "HAIDA NATION", type: "spelling", severity: "warning" }]);
    const one = createDictionaryMatcher([{ language: "de-DE", wordKey: "haida" }]);
    const both = createDictionaryMatcher([
      { language: "de-DE", wordKey: "haida" },
      { language: "de-DE", wordKey: "nation" },
    ]);
    expect(run(claude, [], one).issues).toHaveLength(1);
    expect(run(claude, [], both).issues).toEqual([]);
  });

  it("never removes a grammar issue on a dictionary word", () => {
    const claude = analysis("de-DE", ["ICH LIEBE MEINE HUND"], [{ original: "MEINE", type: "grammar" }]);
    const dictionary = createDictionaryMatcher([{ language: "de-DE", wordKey: "meine" }]);
    expect(run(claude, [lt(0, 10, 15, "grammar", ["MEINEN"])], dictionary).issues).toHaveLength(1);
  });

  it("removes LanguageTool misspellings but keeps its grammar matches", () => {
    const dictionary = createDictionaryMatcher([{ language: "fr-FR", wordKey: "chose" }]);
    const claude = analysis("fr-FR", ["Les petites chose"], []);
    expect(run(claude, [lt(0, 12, 17, "misspelling", ["choses"])], dictionary).issues).toEqual([]);
    expect(run(claude, [lt(0, 12, 17, "grammar", ["choses"])], dictionary).issues).toHaveLength(1);
  });

  it("keeps a multi-word grammar issue even if every word is in the dictionary", () => {
    const claude = analysis("fr-FR", ["Les petites chose"], [{ original: "petites chose", type: "grammar" }]);
    const dictionary = createDictionaryMatcher([
      { language: "fr-FR", wordKey: "petites" },
      { language: "fr-FR", wordKey: "chose" },
    ]);
    expect(run(claude, [], dictionary).issues).toHaveLength(1);
  });

  it("only applies to the dictionary's language", () => {
    const claude = analysis("fr-FR", ["HAIDA"], [{ original: "HAIDA" }]);
    expect(run(claude, [], dictionary).issues).toHaveLength(1);
  });
});

describe("processSuggestions (case style + dedupe)", () => {
  const texts = (s: Suggestion[]) => s.map((x) => x.text);

  it("YOUR → YOU'RE, Your → You're, your → you're", () => {
    expect(texts(processSuggestions([sug("you're")], "YOUR", "YOUR THE BEST", "en-US"))).toEqual(["YOU'RE"]);
    expect(texts(processSuggestions([sug("YOU'RE")], "Your", "Your the best", "en-US"))).toEqual(["You're"]);
    expect(texts(processSuggestions([sug("You're")], "your", "your the best", "en-US"))).toEqual(["you're"]);
  });

  it('"A" → "An" in a normal block, "AN" in an ALL CAPS block', () => {
    expect(texts(processSuggestions([sug("an")], "A", "A apple a day", "en-US"))).toEqual(["An"]);
    expect(texts(processSuggestions([sug("an")], "A", "A APPLE A DAY", "en-US"))).toEqual(["AN"]);
  });

  it("leaves McDonald-style originals untouched", () => {
    expect(texts(processSuggestions([sug("McDonald's")], "McDonalds", "McDonalds farm", "en-US"))).toEqual(["McDonald's"]);
  });

  it("ß → SS when uppercasing German", () => {
    expect(texts(processSuggestions([sug("Straße")], "STRASE", "DIE STRASE", "de-DE"))).toEqual(["STRASSE"]);
  });

  it("keeps accents when uppercasing French", () => {
    expect(texts(processSuggestions([sug("été")], "ETE", "VIVE L'ETE", "fr-FR"))).toEqual(["ÉTÉ"]);
  });

  it("de-duplicates case-insensitively across sources, Claude first, max 3", () => {
    const result = processSuggestions(
      [sug("YOU'RE", "lt"), sug("you're", "claude"), sug("YOU ARE", "claude"), sug("YORE", "lt"), sug("YOUR'E", "lt")],
      "YOUR",
      "YOUR THE BEST",
      "en-US",
    );
    expect(result.map((s) => [s.text, s.source])).toEqual([
      ["YOU'RE", "claude"],
      ["YOU ARE", "claude"],
      ["YORE", "lt"],
    ]);
  });

  it("drops suggestions identical to the original", () => {
    expect(processSuggestions([sug("HAIDA")], "HAIDA", "HAIDA PRIDE", "en-US")).toEqual([]);
  });
});

describe("fr-FR ALL CAPS missing accent rule", () => {
  it("ETE → ÉTÉ (LanguageTool misspelling) is lowered to info", () => {
    const result = run(analysis("fr-FR", ["VIVE L'ETE"], []), [lt(0, 7, 10, "misspelling", ["ÉTÉ", "ET", "ÊTRE"])]);
    expect(result.issues[0].severity).toBe("info");
    expect(result.status).toBe("ok");
  });

  it("still lowers when the accent-only suggestion is second (ETC, ÉTÉ)", () => {
    const result = run(analysis("fr-FR", ["VIVE L'ETE"], []), [lt(0, 7, 10, "misspelling", ["ETC", "ÉTÉ"])]);
    expect(result.issues[0].severity).toBe("info");
  });

  it("counts Claude's suggestions too after merging", () => {
    const result = run(
      analysis("fr-FR", ["VIVE L'ETE"], [{ original: "ETE", type: "accent", severity: "error", suggestions: [{ text: "ÉTÉ", note_vi: null }] }]),
      [lt(0, 7, 10, "misspelling", ["ETC"])],
    );
    expect(result.issues[0].severity).toBe("info");
  });

  it("does not apply to lowercase French", () => {
    const result = run(analysis("fr-FR", ["vive l'ete"], []), [lt(0, 7, 10, "misspelling", ["été"])]);
    expect(result.issues[0].severity).toBe("error");
  });

  it("TU → TÚ (es-ES) stays an error", () => {
    const result = run(analysis("es-ES", ["TU ERES MI VIDA"], [{ original: "TU", type: "accent", suggestions: [{ text: "TÚ", note_vi: null }] }]), [
      lt(0, 0, 2, "misspelling", ["TÚ"]),
    ]);
    expect(result.issues[0].severity).toBe("error");
    expect(result.status).toBe("error");
  });

  it("FUR → FÜR (de-DE) stays an error", () => {
    const result = run(analysis("de-DE", ["NUR FUR DICH"], [{ original: "FUR", type: "accent", suggestions: [{ text: "FÜR", note_vi: null }] }]), [
      lt(0, 4, 7, "misspelling", ["FU", "VfR", "VR"]),
    ]);
    expect(result.issues[0].severity).toBe("error");
    expect(result.status).toBe("error");
  });

  it("FUER (de-DE) is a valid spelling: dropped from both sources", () => {
    const result = run(
      analysis("de-DE", ["FUER IMMER"], [{ original: "FUER", type: "spelling", severity: "warning", suggestions: [{ text: "FÜR", note_vi: null }] }]),
      [lt(0, 0, 4, "misspelling", ["FÜR", "FEUER"])],
    );
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("ok");
    expect(result.blocks[0].correctedText).toBe("FUER IMMER");
  });

  it("FUER (de-DE): dropped even when LanguageTool alone flags it without offering FÜR", () => {
    const result = run(analysis("de-DE", ["FUER IMMER"], []), [lt(0, 0, 4, "misspelling", ["FU", "VFR", "VDE"])]);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("ok");
    expect(result.blocks[0].correctedText).toBe("FUER IMMER");
  });

  it("de-DE: a real misspelling Claude also reports on a word with UE is kept", () => {
    const result = run(
      analysis("de-DE", ["DAS FEUEER BRENNT"], [{ original: "FEUEER", type: "spelling", suggestions: [{ text: "FEUER", note_vi: null }] }]),
      [lt(0, 4, 10, "misspelling", ["FEUER"])],
    );
    expect(result.issues).toHaveLength(1);
    expect(result.status).toBe("error");
  });

  it("FELIZ ANO NUEVO (es-ES): Claude's missing Ñ is an error even if marked warning/intentional", () => {
    const result = run(
      analysis("es-ES", ["FELIZ ANO NUEVO"], [
        { original: "ANO", type: "accent", severity: "warning", intentional_possible: true, suggestions: [{ text: "AÑO", note_vi: null }] },
      ]),
    );
    expect(result.issues[0]).toMatchObject({ severity: "error", intentionalPossible: false });
    expect(result.status).toBe("error");
    expect(result.blocks[0].correctedText).toBe("FELIZ AÑO NUEVO");
  });
});

describe("spelling errors LanguageTool accepted (Claude only)", () => {
  const wog = () =>
    analysis("de-DE", ["KLAR HABE ICH ZUGENOMMEN ICH WOG MAL 3500 GRAMM"], [
      { original: "WOG", type: "spelling", severity: "error", suggestions: [{ text: "WOGEN", note_vi: null }] },
    ]);

  it("ICH WOG MAL: at most Nghi ngờ, and the doubtful fix is not applied", () => {
    const result = run(wog());
    expect(result.issues[0].severity).toBe("warning");
    expect(result.status).toBe("warning");
    expect(result.issues[0].ltAccepted).toBe(true);
    expect(result.blocks[0].correctedText).toBe("KLAR HABE ICH ZUGENOMMEN ICH WOG MAL 3500 GRAMM");
  });

  it("FELIZ ANO NUEVO stays Lỗi: the fix only adds Ñ", () => {
    const result = run(
      analysis("es-ES", ["FELIZ ANO NUEVO"], [{ original: "ANO", type: "spelling", severity: "error", suggestions: [{ text: "AÑO", note_vi: null }] }]),
    );
    expect(result.issues[0].severity).toBe("error");
    expect(result.status).toBe("error");
  });

  it("TU → TÚ (accent only) stays Lỗi", () => {
    const result = run(analysis("es-ES", ["TU ERES MI VIDA"], [{ original: "TU", type: "spelling", suggestions: [{ text: "TÚ", note_vi: null }] }]));
    expect(result.status).toBe("error");
  });

  it("MEINE HUND stays Lỗi: grammar is not affected", () => {
    const result = run(
      analysis("de-DE", ["ICH LIEBE MEINE HUND"], [{ original: "MEINE HUND", type: "grammar", suggestions: [{ text: "MEINEN HUND", note_vi: null }] }]),
    );
    expect(result.issues[0].severity).toBe("error");
    expect(result.status).toBe("error");
  });

  it("stays Lỗi when LanguageTool also flags the word", () => {
    const result = run(
      analysis("de-DE", ["DIE BESTE FREUNDIM"], [{ original: "FREUNDIM", type: "spelling", suggestions: [{ text: "FREUNDIN", note_vi: null }] }]),
      [lt(0, 10, 18, "misspelling", ["FREUNDIN"])],
    );
    expect(result.status).toBe("error");
  });

  it("does not apply when LanguageTool did not check the block (offline, or block language unknown)", () => {
    const offline = analyzeTexts({ claude: wog(), ltMatches: [], ltStatus: "offline" }, noDictionary).result;
    expect(offline.status).toBe("error");

    const unknownBlock = wog();
    unknownBlock.blocks[0] = { ...unknownBlock.blocks[0], language: "unknown" };
    expect(run(unknownBlock).status).toBe("error");
  });
});

describe("computeStatus", () => {
  const issue = (severity: Issue["severity"], sources: Issue["sources"], extra: Partial<Issue> = {}) => ({
    severity,
    sources,
    intentionalPossible: false,
    type: null,
    ...extra,
  });

  it("no_text when there is no text", () => {
    expect(computeStatus(false, [])).toBe("no_text");
  });

  it("error when both sources report an error", () => {
    expect(computeStatus(true, [issue("error", ["claude", "lt"])])).toBe("error");
  });

  it("error when Claude reports a non-intentional error alone", () => {
    expect(computeStatus(true, [issue("error", ["claude"])])).toBe("error");
  });

  it("warning when only LanguageTool reports an error", () => {
    expect(computeStatus(true, [issue("error", ["lt"])])).toBe("warning");
  });

  it("warning for Claude's intentional error, or ocr_uncertain even at info", () => {
    expect(computeStatus(true, [issue("error", ["claude"], { intentionalPossible: true })])).toBe("warning");
    expect(computeStatus(true, [issue("info", ["claude"], { type: "ocr_uncertain" })])).toBe("warning");
  });

  it("ok when only info issues remain", () => {
    expect(computeStatus(true, [issue("info", ["claude", "lt"]), issue("info", ["lt"])])).toBe("ok");
    expect(computeStatus(true, [])).toBe("ok");
  });
});

describe("correctedText", () => {
  const issue = (start: number, end: number, suggestion: string, extra: Partial<Issue> = {}): Issue => ({
    id: "x",
    blockIndex: 0,
    start,
    end,
    original: "",
    sources: ["claude"],
    severity: "error",
    intentionalPossible: false,
    type: "spelling",
    ltIssueType: null,
    explanationVi: null,
    ltLabelVi: null,
    ltMessages: [],
    suggestions: [sug(suggestion)],
    ...extra,
  });

  it("applies the first suggestion of each error/warning", () => {
    expect(correctedText("TU ERES MI VIDA TE QUIERO MAS", [issue(0, 2, "TÚ"), issue(26, 29, "MÁS")])).toBe("TÚ ERES MI VIDA TE QUIERO MÁS");
  });

  it("skips info and intentional issues", () => {
    expect(correctedText("WE'RE GONNA ROCK", [issue(6, 11, "GOING TO", { severity: "info" })])).toBe("WE'RE GONNA ROCK");
    expect(correctedText("WE'RE GONNA ROCK", [issue(6, 11, "GOING TO", { severity: "warning", intentionalPossible: true })])).toBe("WE'RE GONNA ROCK");
  });

  it("keeps an ALL CAPS block ALL CAPS", () => {
    const result = run(
      analysis("de-DE", ["ICH LIEBE MEINE HUND"], [{ original: "MEINE", type: "grammar", suggestions: [{ text: "meinen", note_vi: null }] }]),
      [lt(0, 10, 15, "grammar", ["Meinen"])],
    );
    expect(result.blocks[0].correctedText).toBe("ICH LIEBE MEINEN HUND");
  });
});

describe("English (not checked)", () => {
  const english = (issues: Parameters<typeof analysis>[2] = []) => {
    const claude = analysis("de-DE", ["YOUR THE BEST"], issues);
    return { ...claude, language: "en-US" as const, blocks: [{ ...claude.blocks[0], language: "en-US" as const }] };
  };

  it("drops Claude's issues on English blocks and makes the image Nghi ngờ", () => {
    const result = run(english([{ original: "YOUR", type: "grammar", suggestions: [{ text: "YOU'RE", note_vi: null }] }]));
    expect(result.issues).toEqual([]);
    expect(result.uncheckedBlocks).toEqual([0]);
    expect(result.status).toBe("warning");
    expect(result.blocks[0].correctedText).toBe("YOUR THE BEST");
  });

  it("an English-only image without issues is still Nghi ngờ, never Không lỗi", () => {
    expect(run(english()).status).toBe("warning");
  });

  it("German errors next to English text still make the image Lỗi", () => {
    const claude = analysis("de-DE", ["NUR FUR DICH", "BEST DAD EVER"], [{ original: "FUR", type: "accent", suggestions: [{ text: "FÜR", note_vi: null }] }]);
    claude.blocks[1] = { ...claude.blocks[1], language: "en-US" };
    const result = run(claude, [lt(0, 4, 7, "misspelling", ["FU"])]);
    expect(result.status).toBe("error");
    expect(result.uncheckedBlocks).toEqual([1]);
  });

  it("does not count empty English blocks", () => {
    const claude = analysis("de-DE", ["DIE BESTE MAMA", " "], []);
    claude.blocks[1] = { ...claude.blocks[1], language: "en-US" };
    const result = run(claude);
    expect(result.uncheckedBlocks).toEqual([]);
    expect(result.status).toBe("ok");
  });
});

describe("analyzeTexts", () => {
  it("no_text for an image without text", () => {
    const result = run({ has_text: false, language: "unknown", blocks: [], issues: [], notes_vi: "Không có chữ" });
    expect(result.status).toBe("no_text");
  });

  it("passes LanguageTool status through", () => {
    const { result } = analyzeTexts({ claude: analysis("de-DE", ["HALLO"], []), ltMatches: [], ltStatus: "offline" }, noDictionary);
    expect(result.ltStatus).toBe("offline");
  });
});

describe("trimSuggestionContext", () => {
  const trim = (block: string, original: string, suggestion: string) => {
    const start = block.indexOf(original);
    return trimSuggestionContext(suggestion, block, start, start + original.length, "en-US");
  };

  it("strips words repeated from before or after the span", () => {
    expect(trim("BEST FREIND\nEVER", "FREIND", "BEST FRIEND")).toBe("FRIEND");
    expect(trim("YOUR THE BEST\nDAD EVER", "YOUR", "YOU'RE THE BEST")).toBe("YOU'RE");
    expect(trim("LES PETITES CHOSE DE LA VIE", "CHOSE", "LES PETITES CHOSES DE LA VIE")).toBe("CHOSES");
    expect(trim("TU ERES\nMI VIDA", "TU", "TÚ ERES MI VIDA")).toBe("TÚ");
    expect(trim("Bonne fete papa", "fete", "bonne fête")).toBe("fête");
  });

  it("keeps real multi-word fixes and at least one word", () => {
    expect(trim("YOUR THE BEST", "YOUR", "YOU ARE")).toBe("YOU ARE");
    expect(trim("THERE GOING TO LOVE IT", "THERE", "THEY ARE")).toBe("THEY ARE");
    expect(trim("GROSSE LIEBE", "GROSSE", "GROSSE LIEBE")).toBe("GROSSE");
    expect(trim("I LOVE THE THE CAT", "THE THE", "THE")).toBe("THE");
  });

  it("does not trim when the neighbouring word differs", () => {
    expect(trim("ICH LIEBE MEINE HUND", "HUND", "MEINEN HUND")).toBe("MEINEN HUND");
  });
});

describe("analyzeTexts with over-wide suggestions", () => {
  it("applies the trimmed suggestion to the corrected text", () => {
    const result = run(
      analysis("fr-FR", ["LES PETITES CHOSE\nDE LA VIE"], [{ original: "CHOSE", type: "grammar", suggestions: [{ text: "LES PETITES CHOSES", note_vi: null }] }]),
    );
    expect(result.issues[0].suggestions.map((s) => s.text)).toEqual(["CHOSES"]);
    expect(result.blocks[0].correctedText).toBe("LES PETITES CHOSES\nDE LA VIE");
  });

  it("drops a suggestion that only repeats the context (nothing left to change)", () => {
    const result = run(analysis("de-DE", ["GROSSE LIEBE"], [{ original: "GROSSE", suggestions: [{ text: "GROSSE LIEBE", note_vi: null }] }]));
    expect(result.issues[0].suggestions).toEqual([]);
    expect(result.blocks[0].correctedText).toBe("GROSSE LIEBE");
  });
});
