import { assertProductionClaudeConfig } from "@/lib/claude/config";
import { startWarmup } from "@/lib/languagetool-warmup";

/** Node.js-only server startup, called from instrumentation.ts. */
export function runServerStartup(): void {
  // Production must have a real Claude configuration: stop at startup with a clear message
  // instead of serving requests that can only fail. Mock mode is never allowed there.
  try {
    assertProductionClaudeConfig();
  } catch (error) {
    // A thrown error only marks the server as broken while it keeps running; exit instead.
    console.error(`[startup] ${error instanceof Error ? error.message : String(error)}. Server is stopping.`);
    process.exit(1);
  }

  // Fire and forget: warm-up must not block the server from starting.
  startWarmup();
}
