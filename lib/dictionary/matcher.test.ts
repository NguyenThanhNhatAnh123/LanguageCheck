import { describe, expect, it } from "vitest";
import { createDictionaryMatcher } from "./matcher";
import { toWordKey } from "./word-key";

describe("createDictionaryMatcher", () => {
  const matcher = createDictionaryMatcher([
    { language: "en-US", wordKey: toWordKey("Haida", "en-US") },
    { language: "de-DE", wordKey: toWordKey("Straße", "de-DE") },
    { language: "de-DE", wordKey: toWordKey("für", "de-DE") },
  ]);

  it("matches regardless of case", () => {
    expect(matcher.has("HAIDA", "en-US")).toBe(true);
    expect(matcher.has("haida", "en-US")).toBe(true);
  });

  it("matches ALL-CAPS German with SS and umlauts", () => {
    expect(matcher.has("STRASSE", "de-DE")).toBe(true);
    expect(matcher.has("FÜR", "de-DE")).toBe(true);
  });

  it("only matches within the same language", () => {
    expect(matcher.has("HAIDA", "de-DE")).toBe(false);
    expect(matcher.has("FÜR", "en-US")).toBe(false);
  });

  it("does not match a different word", () => {
    expect(matcher.has("FUR", "de-DE")).toBe(false);
    expect(matcher.has("Lakota", "en-US")).toBe(false);
  });
});
