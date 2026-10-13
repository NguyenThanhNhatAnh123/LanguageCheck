import { describe, expect, it } from "vitest";
import { addedSpecialCharacters } from "./special-chars";

describe("addedSpecialCharacters", () => {
  it("lists accented letters and ¿ ¡ the fix adds", () => {
    expect(addedSpecialCharacters("FUR", "FÜR")).toEqual(["Ü"]);
    expect(addedSpecialCharacters("ANO", "AÑO")).toEqual(["Ñ"]);
    expect(addedSpecialCharacters("ETE", "ÉTÉ")).toEqual(["É"]);
    expect(addedSpecialCharacters("QUE PASA?", "¿QUE PASA?")).toEqual(["¿"]);
    expect(addedSpecialCharacters("STRASSE", "STRAßE")).toEqual(["ß"]);
    expect(addedSpecialCharacters("tres", "très")).toEqual(["è"]);
    expect(addedSpecialCharacters("FACON", "FAÇON")).toEqual(["Ç"]);
  });

  it("ignores characters already in the text, in any case", () => {
    expect(addedSpecialCharacters("für", "FÜR")).toEqual([]);
    expect(addedSpecialCharacters("CHOSE", "CHOSES")).toEqual([]);
    expect(addedSpecialCharacters("YOUR", "YOU'RE")).toEqual([]);
  });

  it("does not count typographic punctuation", () => {
    expect(addedSpecialCharacters("YOUR", "YOU’RE")).toEqual([]);
  });
});
