export async function register() {
  // register() does not run during `next build`, so building without secrets still works.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runServerStartup } = await import("./lib/startup");
    runServerStartup();
  }
}
