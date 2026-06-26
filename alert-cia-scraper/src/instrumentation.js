export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScraperScheduler } = await import("./lib/scheduler");

    startScraperScheduler();
  }
}