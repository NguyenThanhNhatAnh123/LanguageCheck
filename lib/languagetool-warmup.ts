import { check } from "@/lib/languagetool";
import { LANGUAGES, type Language } from "@/lib/languages";

// The first check per language after LanguageTool starts is slow (de-DE ~12s on the dev machine)
// because LanguageTool loads its language data lazily. Warm-up sends one short fixed sentence
// per language so real requests are not the ones paying that cost.

type LtStatus = "unknown" | "online" | "offline";

interface LtState {
  lastStatus: LtStatus;
  warming: boolean;
  /** Set while the running warm-up waits in backoff; calling it retries immediately. */
  wakeUp: (() => void) | null;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

// Each sentence has a deliberate typo so the speller's suggestion data is loaded too;
// without it the first real misspelling still pays a multi-second load.
const WARMUP_TEXT: Record<Language, string> = {
  "de-DE": "Das ist ein kurzer Tset.",
  "fr-FR": "Ceci est un court tset.",
  "es-ES": "Esto es una prueba crota.",
};

// On globalThis so dev hot reload does not reset the state or start parallel warm-ups.
const globalForLt = globalThis as typeof globalThis & { __podQaLanguageTool?: LtState };

function ltState(): LtState {
  globalForLt.__podQaLanguageTool ??= { lastStatus: "unknown", warming: false, wakeUp: null };
  return globalForLt.__podQaLanguageTool;
}

/**
 * Starts a background warm-up. Never awaited by callers. If one is already running and
 * waiting in backoff, it is woken up instead, so a LanguageTool that just came online is
 * warmed right away rather than after up to MAX_BACKOFF_MS.
 */
export function startWarmup(): void {
  const state = ltState();
  if (state.warming) {
    state.wakeUp?.();
    return;
  }
  state.warming = true;
  void runWarmup(state).finally(() => {
    state.warming = false;
    state.wakeUp = null;
  });
}

/** Called by /api/lt-health. Going online from offline/unknown triggers a warm-up. */
export function recordLanguageToolHealth(online: boolean): void {
  const state = ltState();
  const previous = state.lastStatus;
  state.lastStatus = online ? "online" : "offline";
  if (online && previous !== "online") startWarmup();
}

async function runWarmup(state: LtState): Promise<void> {
  const startedAt = Date.now();
  let loggedWaiting = false;

  for (const language of LANGUAGES) {
    let backoffMs = INITIAL_BACKOFF_MS;
    for (;;) {
      try {
        await check(WARMUP_TEXT[language], language);
        break;
      } catch {
        if (!loggedWaiting) {
          console.warn("[lt-warmup] LanguageTool not ready, retrying with backoff");
          loggedWaiting = true;
        }
        await backoffSleep(state, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  }

  // LanguageTool just answered every language, so it is online. Without this, the first
  // successful health check would see "unknown" -> "online" and warm up a second time.
  state.lastStatus = "online";
  console.info(`[lt-warmup] warmed ${LANGUAGES.length} languages in ${Date.now() - startedAt}ms`);
}

function backoffSleep(state: LtState, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      state.wakeUp = null;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    state.wakeUp = finish;
  });
}
