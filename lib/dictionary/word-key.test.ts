import { describe, expect, it } from "vitest";
import { toWordKey } from "./word-key";

describe("toWordKey", () => {
  it("treats FÜR and für as the same word (de-DE)", () => {
    expect(toWordKey("FÜR", "de-DE")).toBe(toWordKey("für", "de-DE"));
  });

  it("treats STRASSE and straße as the same word (de-DE)", () => {
    expect(toWordKey("STRASSE", "de-DE")).toBe(toWordKey("straße", "de-DE"));
    expect(toWordKey("straße", "de-DE")).toBe("strasse");
  });

  it("maps capital ẞ like ß (de-DE)", () => {
    expect(toWordKey("STRAẞE", "de-DE")).toBe("strasse");
  });

  it("only folds ß to ss for de-DE", () => {
    expect(toWordKey("straße", "es-ES")).toBe("straße");
  });

  it("normalizes decomposed accents to NFC", () => {
    const decomposed = "été"; // "été" written as e + combining acute
    expect(toWordKey(decomposed, "fr-FR")).toBe(toWordKey("ÉTÉ", "fr-FR"));
    expect(toWordKey(decomposed, "fr-FR")).toBe("été");
  });

  it("keeps accents, so words that differ only by accent stay different", () => {
    expect(toWordKey("TU", "es-ES")).not.toBe(toWordKey("TÚ", "es-ES"));
  });

  it("lower-cases names in any case", () => {
    expect(toWordKey("HAIDA", "es-ES")).toBe("haida");
    expect(toWordKey("Lakota", "es-ES")).toBe("lakota");
  });
});
