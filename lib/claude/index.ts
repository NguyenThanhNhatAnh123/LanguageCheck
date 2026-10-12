import { getClaudeConfig } from "./config";
import { createLiveTransport } from "./live-transport";
import { createMockTransport } from "./mock-transport";
import type { ClaudeTransport } from "./transport";

export interface ClaudeRuntime {
  transport: ClaudeTransport;
  mock: boolean;
  maxConcurrency: number;
}

const globalForClaude = globalThis as typeof globalThis & {
  __podQaClaudeRuntime?: { key: string; runtime: ClaudeRuntime };
};

/** Live SDK client, or fixtures in development without a key. Cached per configuration. */
export function getClaudeRuntime(): ClaudeRuntime {
  const config = getClaudeConfig();
  const key = config.mode === "live" ? `live:${config.model}:${config.effort}:${config.maxConcurrency}` : `mock:${config.maxConcurrency}`;
  const cached = globalForClaude.__podQaClaudeRuntime;
  if (cached?.key === key) return cached.runtime;

  const runtime: ClaudeRuntime =
    config.mode === "live"
      ? {
          transport: createLiveTransport({ apiKey: config.apiKey, model: config.model, effort: config.effort }),
          mock: false,
          maxConcurrency: config.maxConcurrency,
        }
      : { transport: createMockTransport(), mock: true, maxConcurrency: config.maxConcurrency };

  if (runtime.mock) console.info("[claude] mock mode: answering from fixtures/claude");
  globalForClaude.__podQaClaudeRuntime = { key, runtime };
  return runtime;
}
