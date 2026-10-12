// The analyze pipeline talks to Claude through this interface, so the live SDK client and
// the fixture-based mock share the same retry, validation and concurrency logic.

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export interface ClaudeRequest {
  image: { data: Buffer; mediaType: ImageMediaType };
  /** Original file name; only the mock uses it (to pick a fixture). Never logged. */
  fileName: string;
  systemPrompt: string;
  maxTokens: number;
  /** 0 for the first call, incremented on each retry. */
  attempt: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ClaudeRawResponse {
  /** "end_turn", "max_tokens", "refusal", ... */
  stopReason: string | null;
  /** Concatenated text blocks: the structured-output JSON. */
  text: string;
  usage: TokenUsage;
  model: string;
}

export interface ClaudeTransport {
  send(request: ClaudeRequest): Promise<ClaudeRawResponse>;
}

/** Raised by transports for API/network failures that survived the SDK's own retries. */
export class ClaudeTransportError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate_limit" | "overloaded" | "bad_request" | "network" | "api",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClaudeTransportError";
  }
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}
