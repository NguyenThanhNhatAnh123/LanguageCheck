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
    expect(parseCsv("﻿language,word\n\nes-ES,Haida\n")).toEqual([
      ["language", "word"],
      ["es-ES", "Haida"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["es-ES", "Haida", 'tên "bộ tộc", Mỹ'], ["de-DE", "Straße", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parseDictionaryCsv", () => {
  it("reads language, word and an optional note in any column order", () => {
    const result = parseDictionaryCsv("Word,Language\nHaida,es-ES\nStraße,de-DE\n");
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      { language: "es-ES", word: "Haida", note: null },
      { language: "de-DE", word: "Straße", note: null },
    ]);
  });

  it("reports invalid lines (1-based, counting the header)", () => {
    const result = parseDictionaryCsv("language,word,note\nes-ES,Haida,ok\nvi-VN,Xin chào,\nfr-FR,,\nes-ES,  Señorita  ,\n");
    expect(result.rows).toEqual([
      { language: "es-ES", word: "Haida", note: "ok" },
      { language: "es-ES", word: "Señorita", note: null },
    ]);
    expect(result.invalidLines).toEqual([3, 4]);
  });

  it("rejects en-US rows: the tool no longer checks English", () => {
    const result = parseDictionaryCsv("language,word\nen-US,Haida\nde-DE,Haida\n");
    expect(result.rows).toEqual([{ language: "de-DE", word: "Haida", note: null }]);
    expect(result.invalidLines).toEqual([2]);
  });

  it("rejects a file without the required columns", () => {
    expect(parseDictionaryCsv("foo,bar\n1,2\n").error).toMatch(/language/);
    expect(parseDictionaryCsv("").error).toMatch(/trống/);
  });

  it("exports what it imports", () => {
    const csv = dictionaryToCsv([
      { language: "es-ES", word: "Haida", note: "tên, bộ tộc" },
      { language: "de-DE", word: "Straße", note: null },
    ]);
    expect(parseDictionaryCsv(csv).rows).toEqual([
      { language: "es-ES", word: "Haida", note: "tên, bộ tộc" },
      { language: "de-DE", word: "Straße", note: null },
    ]);
  });
});
