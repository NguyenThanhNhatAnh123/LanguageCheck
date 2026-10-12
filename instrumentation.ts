export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWarmup } = await import("./lib/languagetool-warmup");
    // Fire and forget: warm-up must not block the server from starting.
    startWarmup();
  }
}
