import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ClaudeRawResponse, ClaudeRequest, ClaudeTransport } from "./transport";

// Fixture-based stand-in for Claude, used in development without an API key (CLAUDE_MOCK=1
// or no ANTHROPIC_API_KEY). Never used in production: see lib/claude/config.ts.
//
// fixtures/claude/<id>.json holds a sequence of responses; attempt N gets responses[N]
// (the last one repeats). That lets a fixture fail first and succeed on retry.

const fixtureResponseSchema = z.object({
  stop_reason: z.string(),
  /** A structured result, serialized to JSON as the response text. */
  output: z.unknown().optional(),
  /** Exact response text, for broken JSON or truncated output. */
  raw_text: z.string().optional(),
});

const fixtureSchema = z.object({
  description: z.string(),
  /** Keywords; a file name containing one selects this fixture (case-insensitive). */
  match: z.array(z.string().min(3)).min(1),
  /** Whether an unmatched file name may get this fixture at random. */
  pick_randomly: z.boolean(),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
  responses: z.array(fixtureResponseSchema).min(1),
});

export type ClaudeFixture = z.infer<typeof fixtureSchema> & { id: string };

export const DEFAULT_FIXTURES_DIR = path.join(process.cwd(), "fixtures", "claude");

export function loadFixtures(dir: string = DEFAULT_FIXTURES_DIR): ClaudeFixture[] {
  return fs
    // turbopackIgnore: mock is dev-only, fixtures must not be traced into the production build.
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const id = file.slice(0, -".json".length);
      const parsed = fixtureSchema.safeParse(JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8")));
      if (!parsed.success) throw new Error(`Invalid Claude fixture: ${file}`);
      return { ...parsed.data, id };
    });
}

/**
 * Picks the fixture with a `match` keyword contained in the file name
 * ("shirt-GONNA_02.jpg" → keyword "gonna"); the longest matching keyword wins.
 * Unmatched names get a pseudo-random fixture among those with pick_randomly = true,
 * derived from a hash of the name: different files spread across fixtures, but one file
 * always gets the same fixture, so retries and "Thử lại" behave consistently.
 */
export function selectFixture(fixtures: readonly ClaudeFixture[], fileName: string): ClaudeFixture {
  const normalized = fileName.toLowerCase().replace(/[\s_.]+/g, "-");
  let matched: { fixture: ClaudeFixture; length: number } | undefined;
  for (const fixture of fixtures) {
    for (const keyword of fixture.match) {
      if (normalized.includes(keyword.toLowerCase()) && keyword.length > (matched?.length ?? 0)) {
        matched = { fixture, length: keyword.length };
      }
    }
  }
  if (matched) return matched.fixture;

  const pool = fixtures.filter((fixture) => fixture.pick_randomly);
  if (pool.length === 0) throw new Error("No Claude fixture can be picked randomly");
  return pool[hashString(normalized) % pool.length];
}

/** FNV-1a, 32-bit. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fixtureResponse(fixture: ClaudeFixture, attempt: number): ClaudeRawResponse {
  const response = fixture.responses[Math.min(attempt, fixture.responses.length - 1)];
  const text = response.raw_text ?? JSON.stringify(response.output ?? null);
  return {
    stopReason: response.stop_reason,
    text,
    model: "mock",
    usage: {
      inputTokens: fixture.usage.input_tokens,
      outputTokens: fixture.usage.output_tokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
  };
}

export interface MockTransportOptions {
  fixturesDir?: string;
  /** Simulated latency range, so queues and progress bars behave like the real API. */
  latencyMs?: [number, number];
}

export function createMockTransport(options: MockTransportOptions = {}): ClaudeTransport {
  const [minLatency, maxLatency] = options.latencyMs ?? [400, 1500];
  return {
    async send(request: ClaudeRequest): Promise<ClaudeRawResponse> {
      // Reloaded per call so fixture edits apply without restarting the dev server.
      const fixture = selectFixture(loadFixtures(options.fixturesDir), request.fileName);
      const latency = minLatency + Math.random() * (maxLatency - minLatency);
      if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
      return fixtureResponse(fixture, request.attempt);
    },
  };
}
