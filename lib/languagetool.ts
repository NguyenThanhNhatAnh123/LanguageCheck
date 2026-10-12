import { z } from "zod";
import { getLanguageToolUrl } from "@/lib/env";
import type { Language } from "@/lib/languages";

const CHECK_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 500;

const ltMatchSchema = z.object({
  message: z.string(),
  shortMessage: z.string().optional(),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
  replacements: z.array(z.object({ value: z.string() })),
  rule: z.object({
    id: z.string(),
    description: z.string().optional(),
    issueType: z.string().optional(),
    category: z.object({ id: z.string(), name: z.string() }).optional(),
  }),
});

const ltCheckResponseSchema = z.object({
  matches: z.array(ltMatchSchema),
});

export type LtMatch = z.infer<typeof ltMatchSchema>;

export class LanguageToolError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LanguageToolError";
  }
}

export async function check(text: string, language: Language): Promise<LtMatch[]> {
  const parsed = ltCheckResponseSchema.safeParse(await checkRaw(text, language));
  if (!parsed.success) {
    throw new LanguageToolError("Unexpected LanguageTool response shape", false);
  }
  return parsed.data.matches;
}

/** Raw LanguageTool JSON. Timeout 30s per attempt, retried once on timeout/network/5xx errors. */
export async function checkRaw(text: string, language: Language): Promise<unknown> {
  try {
    return await requestCheck(text, language);
  } catch (error) {
    if (error instanceof LanguageToolError && !error.retryable) throw error;
    await sleep(RETRY_DELAY_MS);
    return requestCheck(text, language);
  }
}

export async function isLanguageToolOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${getLanguageToolUrl()}/v2/languages`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function requestCheck(text: string, language: Language): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getLanguageToolUrl()}/v2/check`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language }),
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    // Never include the checked text in error messages or logs.
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new LanguageToolError(
      timedOut ? `LanguageTool timed out after ${CHECK_TIMEOUT_MS / 1000}s` : "LanguageTool unreachable",
      true,
    );
  }

  if (!response.ok) {
    throw new LanguageToolError(`LanguageTool responded ${response.status}`, response.status >= 500);
  }
  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
