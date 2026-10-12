import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionClaudeConfig, getClaudeConfig } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stub(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? "");
}

describe("getClaudeConfig", () => {
  it("uses the mock in development when the API key is missing", () => {
    stub({ NODE_ENV: "development", ANTHROPIC_API_KEY: "", CLAUDE_MOCK: "" });
    expect(getClaudeConfig().mode).toBe("mock");
  });

  it("uses the mock in development when CLAUDE_MOCK=1, even with a key", () => {
    stub({ NODE_ENV: "development", ANTHROPIC_API_KEY: "sk-test", CLAUDE_MODEL: "claude-sonnet-5-5", CLAUDE_MOCK: "1" });
    expect(getClaudeConfig().mode).toBe("mock");
  });

  it("calls Claude in development when a key is set", () => {
    stub({ NODE_ENV: "development", ANTHROPIC_API_KEY: "sk-test", CLAUDE_MODEL: "claude-sonnet-5-5", CLAUDE_MOCK: "" });
    expect(getClaudeConfig()).toMatchObject({ mode: "live", model: "claude-sonnet-5-5" });
  });

  it("never uses the mock in production: CLAUDE_MOCK=1 is an error", () => {
    stub({ NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-test", CLAUDE_MODEL: "claude-sonnet-5-5", CLAUDE_MOCK: "1" });
    expect(() => getClaudeConfig()).toThrow(/not allowed in production/);
  });

  it("never uses the mock in production: a missing key is an error", () => {
    stub({ NODE_ENV: "production", ANTHROPIC_API_KEY: "", CLAUDE_MODEL: "claude-sonnet-5-5", CLAUDE_MOCK: "" });
    expect(() => getClaudeConfig()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("requires CLAUDE_MODEL for live calls", () => {
    stub({ NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-test", CLAUDE_MODEL: "", CLAUDE_MOCK: "" });
    expect(() => getClaudeConfig()).toThrow(/CLAUDE_MODEL/);
  });

  it("defaults concurrency to 8 and effort to low", () => {
    stub({
      NODE_ENV: "production",
      ANTHROPIC_API_KEY: "sk-test",
      CLAUDE_MODEL: "claude-sonnet-5-5",
      CLAUDE_MOCK: "",
      CLAUDE_MAX_CONCURRENCY: "",
      CLAUDE_ANALYZE_EFFORT: "",
    });
    expect(getClaudeConfig()).toMatchObject({ mode: "live", maxConcurrency: 8, effort: "low" });
  });

  it("does not put the key in error messages", () => {
    stub({ NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-secret-value", CLAUDE_MODEL: "", CLAUDE_MOCK: "" });
    expect(() => getClaudeConfig()).toThrow(expect.objectContaining({ message: expect.not.stringContaining("sk-secret-value") }));
  });
});

describe("assertProductionClaudeConfig", () => {
  it("passes in development without a key", () => {
    stub({ NODE_ENV: "development", ANTHROPIC_API_KEY: "" });
    expect(() => assertProductionClaudeConfig()).not.toThrow();
  });

  it("throws in production without a key", () => {
    stub({ NODE_ENV: "production", ANTHROPIC_API_KEY: "", CLAUDE_MOCK: "" });
    expect(() => assertProductionClaudeConfig()).toThrow();
  });
});
