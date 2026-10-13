import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatDictionaryForPrompt, SYSTEM_PROMPT_TEMPLATE } from "./prompt";

describe("SYSTEM_PROMPT_TEMPLATE", () => {
  it("is identical to the prompt in docs/claude-analyze-prompt.md", () => {
    const doc = fs.readFileSync(path.resolve("docs/claude-analyze-prompt.md"), "utf8").replace(/\r\n/g, "\n");
    const section = doc.slice(doc.indexOf("## System prompt"));
    const block = /```\n([\s\S]*?)\n```/.exec(section)?.[1];
    expect(block).toBe(SYSTEM_PROMPT_TEMPLATE);
  });
});

describe("formatDictionaryForPrompt", () => {
  it("writes one line per language in a fixed order, words sorted", () => {
    const text = formatDictionaryForPrompt([
      { language: "de-DE", word: "Straße" },
      { language: "es-ES", word: "Lakota" },
      { language: "es-ES", word: "Haida" },
    ]);
    expect(text).toBe("de-DE: Straße\nes-ES: Haida, Lakota");
  });

  it("writes (empty) for an empty dictionary", () => {
    expect(formatDictionaryForPrompt([])).toBe("(empty)");
  });
});

describe("buildSystemPrompt", () => {
  it("inserts the dictionary at the placeholder", () => {
    const prompt = buildSystemPrompt([{ language: "de-DE", word: "Haida" }]);
    expect(prompt.endsWith("TEAM DICTIONARY:\nde-DE: Haida")).toBe(true);
    expect(prompt).not.toContain("{{DICTIONARY}}");
  });

  it("keeps a $ in a dictionary word literally", () => {
    expect(buildSystemPrompt([{ language: "de-DE", word: "Ca$h$&" }])).toContain("de-DE: Ca$h$&");
  });
});
