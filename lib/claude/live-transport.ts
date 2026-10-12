import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ClaudeEffort } from "./config";
import { USER_INSTRUCTION } from "./prompt";
import { claudeAnalysisSchema } from "./schema";
import {
  ClaudeTransportError,
  type ClaudeRawResponse,
  type ClaudeRequest,
  type ClaudeTransport,
} from "./transport";

// The SDK retries 408/409/429/5xx (including 529 overloaded) and connection errors with
// exponential backoff, honouring retry-after.
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;

// Structured outputs (output_config.format) instead of tool use: current Sonnet/Opus models
// reject forced tool_choice, and the format guarantees schema-shaped JSON in the text block.
const OUTPUT_FORMAT = zodOutputFormat(claudeAnalysisSchema);

// Server-side refusal fallback ("default" routing by refusal category). Only models that
// support it get the parameter; Haiku 5.5 has no server-side fallback.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export interface LiveTransportOptions {
  apiKey: string;
  model: string;
  effort: ClaudeEffort;
}

export function createLiveTransport(options: LiveTransportOptions): ClaudeTransport {
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS });
  const fallback = FALLBACK_MODELS.has(options.model);

  return {
    async send(request: ClaudeRequest): Promise<ClaudeRawResponse> {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: options.model,
          max_tokens: request.maxTokens,
          // System prompt + team dictionary are the cached prefix; the image comes after it.
          system: [{ type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: request.image.mediaType,
                    data: request.image.data.toString("base64"),
                  },
                },
                { type: "text", text: USER_INSTRUCTION },
              ],
            },
          ],
          output_config: {
            effort: options.effort,
            format: { type: OUTPUT_FORMAT.type, schema: OUTPUT_FORMAT.schema },
          },
          ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
      } catch (error) {
        throw toTransportError(error);
      }

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");

      return {
        stopReason: response.stop_reason,
        text,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

function toTransportError(error: unknown): ClaudeTransportError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeTransportError("Claude rejected the API key", "auth", error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ClaudeTransportError("Claude rate limit exceeded", "rate_limit", error.status);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ClaudeTransportError(`Claude rejected the request: ${error.message}`, "bad_request", error.status);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ClaudeTransportError("Could not reach Claude", "network");
  }
  if (error instanceof Anthropic.APIError) {
    const kind = error.status === 529 ? "overloaded" : "api";
    return new ClaudeTransportError(`Claude API error ${error.status ?? ""}`.trim(), kind, error.status);
  }
  return new ClaudeTransportError("Unexpected error calling Claude", "api");
}
