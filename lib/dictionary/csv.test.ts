import { describe, expect, it } from "vitest";
import { dictionaryToCsv, parseCsv, parseDictionaryCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields with commas, quotes and newlines", () => {
    expect(parseCsv('a,"b, c","say ""hi""","line1\nline2"\r\nx,y,z,w\n')).toEqual([
      ["a", "b, c", 'say "hi"', "line1\nline2"],
      ["x", "y", "z", "w"],
    ]);
  });

  it("strips the Excel BOM and blank lines", () => {
    expect(parseCsv("﻿language,word\n\nen-US,Haida\n")).toEqual([
      ["language", "word"],
      ["en-US", "Haida"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["en-US", "Haida", 'tên "bộ tộc", Mỹ'], ["de-DE", "Straße", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parseDictionaryCsv", () => {
  it("reads language, word and an optional note in any column order", () => {
    const result = parseDictionaryCsv("Word,Language\nHaida,en-US\nStraße,de-DE\n");
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      { language: "en-US", word: "Haida", note: null },
      { language: "de-DE", word: "Straße", note: null },
    ]);
  });

  it("reports invalid lines (1-based, counting the header)", () => {
    const result = parseDictionaryCsv("language,word,note\nen-US,Haida,ok\nvi-VN,Xin chào,\nfr-FR,,\nes-ES,  Señorita  ,\n");
    expect(result.rows).toEqual([
      { language: "en-US", word: "Haida", note: "ok" },
      { language: "es-ES", word: "Señorita", note: null },
    ]);
    expect(result.invalidLines).toEqual([3, 4]);
  });

  it("rejects a file without the required columns", () => {
    expect(parseDictionaryCsv("foo,bar\n1,2\n").error).toMatch(/language/);
    expect(parseDictionaryCsv("").error).toMatch(/trống/);
  });

  it("exports what it imports", () => {
    const csv = dictionaryToCsv([
      { language: "en-US", word: "Haida", note: "tên, bộ tộc" },
      { language: "de-DE", word: "Straße", note: null },
    ]);
    expect(parseDictionaryCsv(csv).rows).toEqual([
      { language: "en-US", word: "Haida", note: "tên, bộ tộc" },
      { language: "de-DE", word: "Straße", note: null },
    ]);
  });
});
