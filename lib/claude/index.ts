import { getClaudeConfig } from "./config";
import { createLiveTransport } from "./live-transport";
import { createMockTransport } from "./mock-transport";
import type { ClaudeTransport } from "./transport";

export interface ClaudeRuntime {
  transport: ClaudeTransport;
  mock: boolean;
  /** Configured model (CLAUDE_MODEL), or "mock". */
  model: string;
  maxConcurrency: number;
}

// Module-level, not globalThis: when a dev hot reload changes the schema or the transport
// code, this module reloads too and the transport is rebuilt. Cached on globalThis it kept
// sending the old output schema while the new one validated the answers (every image failed).
let cached: { key: string; runtime: ClaudeRuntime } | undefined;

/** Live SDK client, or fixtures in development without a key. Cached per configuration. */
export function getClaudeRuntime(): ClaudeRuntime {
  const config = getClaudeConfig();
  const key = config.mode === "live" ? `live:${config.model}:${config.effort}:${config.maxConcurrency}` : `mock:${config.maxConcurrency}`;
  if (cached?.key === key) return cached.runtime;

  const runtime: ClaudeRuntime =
    config.mode === "live"
      ? {
          transport: createLiveTransport({ apiKey: config.apiKey, model: config.model, effort: config.effort }),
          mock: false,
          model: config.model,
          maxConcurrency: config.maxConcurrency,
        }
      : { transport: createMockTransport(), mock: true, model: "mock", maxConcurrency: config.maxConcurrency };

  if (runtime.mock) console.info("[claude] mock mode: answering from fixtures/claude");
  cached = { key, runtime };
  return runtime;
}
