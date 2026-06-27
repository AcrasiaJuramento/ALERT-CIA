import { runScraper } from "./runScraper";

const TEN_MINUTES = 10 * 60 * 1000;
const globalKey = "__alertCiaScraperScheduler";

export function startScraperScheduler() {
  if (process.env.SCRAPER_AUTO_REFRESH === "false") return;
  if (globalThis[globalKey]) return;

  globalThis[globalKey] = setInterval(async () => {
    try {
      await runScraper({ endpointType: "all", mode: "update" });
    } catch (error) {
      console.error("[alert-cia-scraper] scheduled run failed:", error);
    }
  }, TEN_MINUTES);
}
