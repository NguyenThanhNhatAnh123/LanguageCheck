import { describe, expect, it } from "vitest";
import { splitWords } from "./split-words";

describe("splitWords", () => {
  it("splits on spaces and punctuation", () => {
    expect(splitWords("petites chose")).toEqual(["petites", "chose"]);
    expect(splitWords("¡HOLA, SEÑORITA!")).toEqual(["HOLA", "SEÑORITA"]);
  });

  it("keeps inner apostrophes and hyphens", () => {
    expect(splitWords("YOU'RE THE BEST")).toEqual(["YOU'RE", "THE", "BEST"]);
    expect(splitWords("rock-n-roll aujourd’hui")).toEqual(["rock-n-roll", "aujourd’hui"]);
  });

  it("drops leading/trailing apostrophes and hyphens", () => {
    expect(splitWords("'rollin' -fast-")).toEqual(["rollin", "fast"]);
  });

  it("removes case-insensitive duplicates and digit-only tokens", () => {
    expect(splitWords("THE the Est. 2024")).toEqual(["THE", "Est"]);
  });

  it("handles letters with accents and German ß", () => {
    expect(splitWords("Grüße aus der Straße")).toEqual(["Grüße", "aus", "der", "Straße"]);
  });

  it("returns nothing for punctuation only", () => {
    expect(splitWords("— !? —")).toEqual([]);
  });
});
