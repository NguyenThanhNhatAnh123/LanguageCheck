import { describe, expect, it } from "vitest";
import { analyzeWithClaude, DEFAULT_MAX_TOKENS } from "./analyze";
import { createMockTransport } from "./mock-transport";
import {
  ClaudeTransportError,
  type ClaudeRawResponse,
  type ClaudeRequest,
  type ClaudeTransport,
} from "./transport";

const VALID_TEXT = JSON.stringify({
  has_text: true,
  language: "en-US",
  blocks: [{ index: 0, text: "HELLO", role: "headline", language: "en-US", legibility: "clear", normal_case: null }],
  issues: [],
  notes_vi: null,
});

const input = {
  image: { data: Buffer.from("fake"), mediaType: "image/jpeg" as const },
  fileName: "x.jpg",
  systemPrompt: "prompt",
};

function response(stopReason: string, text: string): ClaudeRawResponse {
  return {
    stopReason,
    text,
    model: "test-model",
    usage: { inputTokens: 100, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 50 },
  };
}

/** Transport that replays scripted responses and records each request. */
function scripted(...responses: Array<ClaudeRawResponse | Error>) {
  const requests: ClaudeRequest[] = [];
  const transport: ClaudeTransport = {
    async send(request) {
      requests.push(request);
      const next = responses[Math.min(requests.length - 1, responses.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { transport, requests };
}

const run = (transport: ClaudeTransport) => analyzeWithClaude(input, { transport, maxConcurrency: 4 });

describe("analyzeWithClaude", () => {
  it("returns the parsed analysis on success", async () => {
    const { transport, requests } = scripted(response("end_turn", VALID_TEXT));
    const outcome = await run(transport);
    expect(outcome.ok).toBe(true);
    expect(outcome.attempts).toBe(1);
    expect(requests[0].maxTokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("retries a truncated answer once with double max_tokens", async () => {
    const { transport, requests } = scripted(response("max_tokens", '{"has_text": tr'), response("end_turn", VALID_TEXT));
    const outcome = await run(transport);
    expect(outcome.ok).toBe(true);
    expect(requests.map((request) => request.maxTokens)).toEqual([3000, 6000]);
    expect(requests.map((request) => request.attempt)).toEqual([0, 1]);
  });

  it("fails when the answer is still truncated after the retry", async () => {
    const { transport, requests } = scripted(response("max_tokens", "{"));
    const outcome = await run(transport);
    expect(outcome).toMatchObject({ ok: false, reason: "truncated", attempts: 2 });
    expect(requests).toHaveLength(2);
  });

  it("retries invalid output once, then succeeds", async () => {
    const { transport } = scripted(response("end_turn", '{"blocks": "x"}'), response("end_turn", VALID_TEXT));
    expect((await run(transport)).ok).toBe(true);
  });

  it("fails when the output is invalid twice", async () => {
    const { transport, requests } = scripted(response("end_turn", "not json"));
    expect(await run(transport)).toMatchObject({ ok: false, reason: "invalid_output", attempts: 2 });
    expect(requests).toHaveLength(2);
  });

  it("does not retry a refusal", async () => {
    const { transport, requests } = scripted(response("refusal", ""));
    expect(await run(transport)).toMatchObject({ ok: false, reason: "refusal", attempts: 1 });
    expect(requests).toHaveLength(1);
  });

  it("reports API errors that survived the SDK retries", async () => {
    const { transport } = scripted(new ClaudeTransportError("overloaded", "overloaded", 529));
    expect(await run(transport)).toMatchObject({ ok: false, reason: "overloaded", attempts: 0 });
  });

  it("sums token usage over every attempt", async () => {
    const { transport } = scripted(response("max_tokens", "{"), response("end_turn", VALID_TEXT));
    const outcome = await run(transport);
    expect(outcome.usage).toEqual({ inputTokens: 200, outputTokens: 20, cacheCreationInputTokens: 0, cacheReadInputTokens: 100 });
  });

  it("never runs more than maxConcurrency calls at once", async () => {
    let active = 0;
    let peak = 0;
    const transport: ClaudeTransport = {
      async send() {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return response("end_turn", VALID_TEXT);
      },
    };
    // A limit no other test uses, so this gets its own shared semaphore.
    await Promise.all(Array.from({ length: 7 }, () => analyzeWithClaude(input, { transport, maxConcurrency: 2 })));
    expect(peak).toBe(2);
  });
});

describe("analyzeWithClaude with the mock fixtures", () => {
  const transport = createMockTransport({ latencyMs: [0, 0] });
  const analyze = (fileName: string) => analyzeWithClaude({ ...input, fileName }, { transport, maxConcurrency: 4 });

  it("recovers from the truncated fixture with one retry", async () => {
    expect(await analyze("truncated.jpg")).toMatchObject({ ok: true, attempts: 2 });
  });

  it("fails on the invalid-schema fixture after one retry", async () => {
    expect(await analyze("invalid-schema.jpg")).toMatchObject({ ok: false, reason: "invalid_output", attempts: 2 });
  });

  it("reads the slang fixture", async () => {
    const outcome = await analyze("slang.jpg");
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.analysis.issues[0]).toMatchObject({ original: "HAB", severity: "info", intentional_possible: true });
  });
});
