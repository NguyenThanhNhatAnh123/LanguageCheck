import { parseClaudeAnalysis, type ClaudeAnalysis } from "./schema";
import { getClaudeSemaphore } from "./semaphore";
import {
  addUsage,
  ClaudeTransportError,
  ZERO_USAGE,
  type ClaudeRawResponse,
  type ClaudeRequest,
  type ClaudeTransport,
  type TokenUsage,
} from "./transport";

export const DEFAULT_MAX_TOKENS = 3000;

export type ClaudeFailureReason =
  | "truncated"
  | "invalid_output"
  | "refusal"
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "bad_request"
  | "network"
  | "api";

export type ClaudeOutcome =
  | { ok: true; analysis: ClaudeAnalysis; usage: TokenUsage; attempts: number; model: string }
  | { ok: false; reason: ClaudeFailureReason; usage: TokenUsage; attempts: number };

export interface AnalyzeWithClaudeInput {
  image: ClaudeRequest["image"];
  fileName: string;
  systemPrompt: string;
}

export interface AnalyzeWithClaudeOptions {
  transport: ClaudeTransport;
  maxConcurrency: number;
}

/**
 * One image through Claude, with the retry rules from CLAUDE.md:
 * - stop_reason "max_tokens": retry once with double max_tokens (a same-size retry would be
 *   cut at the same place), still cut → failed.
 * - output not valid JSON / not matching the schema: retry once, still invalid → failed.
 * - 429/529/5xx/network: retried with backoff inside the SDK; what survives → failed.
 * - "refusal": failed, no retry (the server-side fallback already had its chance).
 * Usage is summed over every attempt, since every attempt is billed.
 */
export async function analyzeWithClaude(
  input: AnalyzeWithClaudeInput,
  options: AnalyzeWithClaudeOptions,
): Promise<ClaudeOutcome> {
  return getClaudeSemaphore(options.maxConcurrency).run(async () => {
    let usage = ZERO_USAGE;
    let attempts = 0;
    let maxTokens = DEFAULT_MAX_TOKENS;
    let retriedTruncation = false;
    let retriedInvalid = false;

    for (;;) {
      let response: ClaudeRawResponse;
      try {
        response = await options.transport.send({ ...input, maxTokens, attempt: attempts });
      } catch (error) {
        const reason = error instanceof ClaudeTransportError ? error.kind : "api";
        console.error(`[claude] request failed: ${error instanceof Error ? error.message : "unknown error"}`);
        return { ok: false, reason, usage, attempts };
      }
      attempts += 1;
      usage = addUsage(usage, response.usage);

      if (response.stopReason === "refusal") {
        console.warn("[claude] request refused");
        return { ok: false, reason: "refusal", usage, attempts };
      }

      if (response.stopReason === "max_tokens") {
        if (retriedTruncation) {
          console.warn(`[claude] output still truncated at max_tokens=${maxTokens}`);
          return { ok: false, reason: "truncated", usage, attempts };
        }
        retriedTruncation = true;
        maxTokens *= 2;
        continue;
      }

      const parsed = parseClaudeAnalysis(response.text);
      if (!parsed.success) {
        if (retriedInvalid) {
          console.warn(`[claude] output invalid twice (${parsed.reason})`);
          return { ok: false, reason: "invalid_output", usage, attempts };
        }
        retriedInvalid = true;
        continue;
      }

      return { ok: true, analysis: parsed.analysis, usage, attempts, model: response.model };
    }
  });
}

/** Vietnamese reason shown on the "Thất bại" card. */
export const CLAUDE_FAILURE_MESSAGES: Record<ClaudeFailureReason, string> = {
  truncated: "Kết quả của Claude bị cắt giữa chừng, kể cả khi đã tăng giới hạn độ dài.",
  invalid_output: "Claude trả về kết quả sai định dạng 2 lần liên tiếp.",
  refusal: "Claude từ chối xử lý ảnh này.",
  auth: "API key của Claude không hợp lệ. Báo người quản trị.",
  rate_limit: "Claude đang quá tải yêu cầu (rate limit). Thử lại sau ít phút.",
  overloaded: "Máy chủ Claude đang quá tải. Thử lại sau ít phút.",
  bad_request: "Claude không nhận ảnh này (ảnh hỏng hoặc định dạng không hỗ trợ).",
  network: "Không kết nối được tới Claude. Kiểm tra mạng của máy chủ.",
  api: "Claude gặp lỗi khi xử lý. Thử lại sau.",
};
