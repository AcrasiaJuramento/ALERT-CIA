import { runScraper } from "./runScraper";

const TEN_MINUTES = 10 * 60 * 1000;
const globalKey = "__alertCiaScraperScheduler";

export function startScraperScheduler() {
  // Serverless instances are ephemeral, so interval scheduling must be an
  // explicit local/long-running-server opt-in. Use Vercel Cron in production.
  if (process.env.SCRAPER_AUTO_REFRESH !== "true") return;
  if (globalThis[globalKey]) return;

  globalThis[globalKey] = setInterval(async () => {
    try {
      await runScraper({ endpointType: "all", mode: "update" });
    } catch (error) {
      console.error("[alert-cia-scraper] scheduled run failed:", error);
    }
  }, TEN_MINUTES);
}
