import { startScraperScheduler } from "./lib/scheduler";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    startScraperScheduler();
  }
}
