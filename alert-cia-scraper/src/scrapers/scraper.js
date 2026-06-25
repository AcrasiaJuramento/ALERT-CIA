import * as cheerio from "cheerio";
import {
  geocode,
  extractLocation,
  cleanGeocodeQuery,
  isValidLocation
} from "../lib/geocode";

import { fetchHTML } from "../lib/fetchHTML";
import { extractLinks } from "../lib/extractLinks";
import { extractArticle } from "../lib/extractArticle";
import { classify } from "../lib/classify";
import { isRelevant } from "../lib/filters";

export async function scrapeBombo() {
  const SOURCES = {
    bombo: "https://news.bomboradyo.com/?s=isabela",
  };

  const results = [];
  const seen = new Set();

  for (const [sourceName, sourceUrl] of Object.entries(SOURCES)) {
    const listHTML = await fetchHTML(sourceUrl);
    if (!listHTML) continue;

    const links = extractLinks(listHTML, sourceUrl);

    for (const link of links) {
      if (seen.has(link)) continue;
      seen.add(link);

      const html = await fetchHTML(link);
      if (!html) continue;

      const article = extractArticle(html);

      const combined =
        `${article.title || ""}\n${article.snippet || ""}\n${article.body || ""}`;

      if (!isRelevant(combined)) continue;

      const type = classify(combined);
      if (!type) continue;

      const location =
        extractLocation(article.title || "") ||
        extractLocation(article.snippet || "");

      let geo = null;

      if (location && isValidLocation(location)) {
        geo = await geocode(cleanGeocodeQuery(location));
      }

      results.push({
        title: article.title,
        snippet: article.snippet,
        source_url: link,
        source_site: sourceName,
        incident_type: type,
        location,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        display_name: geo?.display_name ?? null,
      });
    }
  }

  return results;
}