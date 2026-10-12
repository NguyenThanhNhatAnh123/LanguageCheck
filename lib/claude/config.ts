import { z } from "zod";

// Mock mode returns fixtures from fixtures/claude/ instead of calling Claude. It is for
// development without an API key and must never run in production.

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type ClaudeEffort = (typeof EFFORT_LEVELS)[number];

export type ClaudeConfig =
  | { mode: "mock"; maxConcurrency: number }
  | { mode: "live"; apiKey: string; model: string; maxConcurrency: number; effort: ClaudeEffort };

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const liveEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().min(1),
  CLAUDE_MAX_CONCURRENCY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(64).default(8)),
  CLAUDE_ANALYZE_EFFORT: z.preprocess(emptyToUndefined, z.enum(EFFORT_LEVELS).default("low")),
});

const concurrencySchema = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(64).default(8));

export class ClaudeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeConfigError";
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function mockRequested(): boolean {
  return process.env.CLAUDE_MOCK === "1";
}

export function getClaudeConfig(): ClaudeConfig {
  const missingKey = !process.env.ANTHROPIC_API_KEY;

  if (isProduction()) {
    if (mockRequested()) throw new ClaudeConfigError("CLAUDE_MOCK=1 is not allowed in production");
  } else if (mockRequested() || missingKey) {
    return { mode: "mock", maxConcurrency: concurrencySchema.parse(process.env.CLAUDE_MAX_CONCURRENCY) };
  }

  const parsed = liveEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Key names only, never values.
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ClaudeConfigError(`Missing or invalid Claude environment variables: ${keys}`);
  }
  const env = parsed.data;
  return {
    mode: "live",
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.CLAUDE_MODEL,
    maxConcurrency: env.CLAUDE_MAX_CONCURRENCY,
    effort: env.CLAUDE_ANALYZE_EFFORT,
  };
}

/**
 * Called once when the production server starts (instrumentation.ts). Fails loudly so a
 * server without a key never comes up silently broken, and mock mode can never be enabled.
 */
export function assertProductionClaudeConfig(): void {
  if (!isProduction()) return;
  getClaudeConfig();
}
