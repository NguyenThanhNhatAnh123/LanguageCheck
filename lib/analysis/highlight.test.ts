import { describe, expect, it } from "vitest";
import { splitIntoSegments } from "./highlight";

describe("splitIntoSegments", () => {
  it("returns the whole text when there are no issues", () => {
    expect(splitIntoSegments("HELLO", [])).toEqual([{ text: "HELLO", severity: null }]);
  });

  it("marks issue ranges with their severity", () => {
    expect(
      splitIntoSegments("TU ERES MI VIDA", [
        { start: 0, end: 2, severity: "error" },
        { start: 8, end: 10, severity: "info" },
      ]),
    ).toEqual([
      { text: "TU", severity: "error" },
      { text: " ERES ", severity: null },
      { text: "MI", severity: "info" },
      { text: " VIDA", severity: null },
    ]);
  });

  it("uses the most severe issue where ranges overlap", () => {
    expect(
      splitIntoSegments("ABCDEF", [
        { start: 0, end: 4, severity: "warning" },
        { start: 2, end: 6, severity: "error" },
      ]),
    ).toEqual([
      { text: "AB", severity: "warning" },
      { text: "CDEF", severity: "error" },
    ]);
  });

  it("ignores unlocated issues", () => {
    expect(splitIntoSegments("HELLO", [{ start: null, end: null, severity: "warning" }])).toEqual([
      { text: "HELLO", severity: null },
    ]);
  });
});
