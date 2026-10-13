import { describe, expect, it } from "vitest";
import { createMockTransport, fixtureResponse, loadFixtures, selectFixture } from "./mock-transport";

const fixtures = loadFixtures();
const ids = fixtures.map((fixture) => fixture.id);

describe("loadFixtures", () => {
  it("covers every case the mock is meant to exercise", () => {
    for (const id of [
      "english",
      "de-error",
      "fr-error",
      "es-error",
      "slang",
      "fr-ete-caps",
      "ocr-uncertain",
      "no-text",
      "invalid-schema",
      "truncated",
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe("selectFixture", () => {
  it("picks by keyword in the file name, ignoring case and separators", () => {
    expect(selectFixture(fixtures, "Shirt_SLANG_02.jpg").id).toBe("slang");
    expect(selectFixture(fixtures, "batch 7 de-error.png").id).toBe("de-error");
    expect(selectFixture(fixtures, "tattoo-OCR-test.jpg").id).toBe("ocr-uncertain");
    expect(selectFixture(fixtures, "my no_text design.png").id).toBe("no-text");
  });

  it("does not match short keywords inside unrelated words", () => {
    // "athlete" contains "ete" but the fr fixture only matches "ete-caps" / "fr-ete".
    expect(selectFixture(fixtures, "athlete.jpg").id).not.toBe("fr-ete-caps");
  });

  it("gives unmatched names a fixture that is allowed at random, the same one every time", () => {
    const first = selectFixture(fixtures, "summer-vibes-123.jpg");
    expect(first.pick_randomly).toBe(true);
    for (let i = 0; i < 5; i++) expect(selectFixture(fixtures, "summer-vibes-123.jpg").id).toBe(first.id);
  });

  it("spreads unmatched names over several fixtures", () => {
    const picked = new Set(Array.from({ length: 60 }, (_, i) => selectFixture(fixtures, `mockup-${i}.jpg`).id));
    expect(picked.size).toBeGreaterThan(3);
    expect(picked.has("invalid-schema")).toBe(false);
    expect(picked.has("truncated")).toBe(false);
  });
});

describe("fixtureResponse", () => {
  it("returns the response for each attempt and repeats the last one", () => {
    const truncated = fixtures.find((fixture) => fixture.id === "truncated");
    if (!truncated) throw new Error("missing fixture");
    expect(fixtureResponse(truncated, 0).stopReason).toBe("max_tokens");
    expect(fixtureResponse(truncated, 1).stopReason).toBe("end_turn");
    expect(fixtureResponse(truncated, 5).stopReason).toBe("end_turn");
  });
});

describe("createMockTransport", () => {
  it("answers with the selected fixture", async () => {
    const transport = createMockTransport({ latencyMs: [0, 0] });
    const response = await transport.send({
      image: { data: Buffer.from(""), mediaType: "image/jpeg" },
      fileName: "slang.jpg",
      systemPrompt: "",
      maxTokens: 3000,
      attempt: 0,
    });
    expect(response.model).toBe("mock");
    expect(response.text).toContain("HAB DICH");
  });
});
