import { describe, expect, it } from "vitest";
import { fixtureResponse, loadFixtures } from "./mock-transport";
import { parseClaudeAnalysis } from "./schema";

const valid = {
  has_text: true,
  language: "en-US",
  blocks: [{ index: 0, text: "YOUR THE BEST", role: "headline", language: "en-US", legibility: "clear" }],
  issues: [
    {
      block_index: 0,
      original: "YOUR",
      occurrence: null,
      type: "grammar",
      severity: "error",
      intentional_possible: false,
      explanation_vi: "Cần YOU'RE.",
      suggestions: [{ text: "YOU'RE", note_vi: null }],
    },
  ],
  notes_vi: null,
};

describe("parseClaudeAnalysis", () => {
  it("accepts a valid result", () => {
    expect(parseClaudeAnalysis(JSON.stringify(valid)).success).toBe(true);
  });

  it("rejects text that is not JSON (e.g. truncated output)", () => {
    expect(parseClaudeAnalysis('{"has_text": true, "blocks": [')).toEqual({ success: false, reason: "invalid_json" });
  });

  it("rejects JSON with the wrong shape", () => {
    expect(parseClaudeAnalysis(JSON.stringify({ ...valid, blocks: "x" }))).toEqual({
      success: false,
      reason: "invalid_schema",
    });
  });

  it("rejects an issue pointing at a missing block", () => {
    const broken = { ...valid, issues: [{ ...valid.issues[0], block_index: 3 }] };
    expect(parseClaudeAnalysis(JSON.stringify(broken)).success).toBe(false);
  });

  it("rejects block indexes that do not match their position", () => {
    const broken = { ...valid, blocks: [{ ...valid.blocks[0], index: 1 }] };
    expect(parseClaudeAnalysis(JSON.stringify(broken)).success).toBe(false);
  });

  it("rejects an empty original", () => {
    const broken = { ...valid, issues: [{ ...valid.issues[0], original: "" }] };
    expect(parseClaudeAnalysis(JSON.stringify(broken)).success).toBe(false);
  });
});

describe("fixtures", () => {
  const fixtures = loadFixtures();

  it("every final fixture answer parses, except the invalid-schema fixture", () => {
    for (const fixture of fixtures) {
      const last = fixtureResponse(fixture, fixture.responses.length - 1);
      expect(parseClaudeAnalysis(last.text).success, fixture.id).toBe(fixture.id !== "invalid-schema");
    }
  });
});
