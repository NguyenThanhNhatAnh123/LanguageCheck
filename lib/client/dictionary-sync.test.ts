import { describe, expect, it } from "vitest";
import { analyzeTexts } from "@/lib/analysis/pipeline";
import type { AnalysisInput } from "@/lib/analysis/types";
import { createDictionaryMatcher } from "@/lib/dictionary/matcher";
import { dictionaryEntries, dictionaryKey, nextResultKeys, shouldRefreshOnFocus } from "./dictionary-sync";

const haida = { language: "de-DE" as const, wordKey: "haida" };
const lakota = { language: "de-DE" as const, wordKey: "lakota" };

describe("nextResultKeys", () => {
  it("adds the current dictionary to what already filtered the result", () => {
    const keys = nextResultKeys(new Set([dictionaryKey(haida)]), [lakota]);
    expect([...keys].sort()).toEqual(["de-DE|haida", "de-DE|lakota"]);
  });

  it("keeps a word deleted from the dictionary: its old errors do not come back", () => {
    const keys = nextResultKeys(new Set([dictionaryKey(haida)]), []);
    expect(keys.has("de-DE|haida")).toBe(true);
  });

  it("forgets a word on Hoàn tác, so its errors come back", () => {
    const keys = nextResultKeys(new Set([dictionaryKey(haida)]), [], new Set([dictionaryKey(haida)]));
    expect(keys.size).toBe(0);
  });
});

describe("dictionaryEntries", () => {
  it("turns keys back into matcher entries, word keys containing | included", () => {
    expect(dictionaryEntries(["de-DE|haida", "fr-FR|a|b", "xx|bad", "nope"])).toEqual([
      { language: "de-DE", wordKey: "haida" },
      { language: "fr-FR", wordKey: "a|b" },
    ]);
  });
});

describe("re-filtering a shown result (end to end with the pipeline)", () => {
  const input: AnalysisInput = {
    claude: {
      has_text: true,
      language: "de-DE",
      blocks: [{ index: 0, text: "STOLZ AUF HAIDA", role: "headline", language: "de-DE", legibility: "clear", normal_case: null }],
      issues: [
        {
          block_index: 0,
          original: "HAIDA",
          occurrence: null,
          type: "spelling",
          severity: "warning",
          intentional_possible: true,
          explanation_vi: "tên riêng",
          suggestions: [],
        },
      ],
      notes_vi: null,
    },
    ltMatches: [],
    ltStatus: "online",
  };
  const statusWith = (keys: Set<string>) => analyzeTexts(input, createDictionaryMatcher(dictionaryEntries(keys))).result.status;

  it("added by someone else: hidden at the next refresh; deleted later: stays hidden", () => {
    let keys = nextResultKeys(new Set(), []);
    expect(statusWith(keys)).toBe("warning");
    keys = nextResultKeys(keys, [haida]); // another machine added HAIDA, this tab got focus
    expect(statusWith(keys)).toBe("ok");
    keys = nextResultKeys(keys, []); // HAIDA deleted from the dictionary
    expect(statusWith(keys)).toBe("ok");
  });
});

describe("shouldRefreshOnFocus", () => {
  it("refreshes at most once per 10 seconds", () => {
    expect(shouldRefreshOnFocus(null, 1000)).toBe(true);
    expect(shouldRefreshOnFocus(1000, 5000)).toBe(false);
    expect(shouldRefreshOnFocus(1000, 11_000)).toBe(true);
  });
});
