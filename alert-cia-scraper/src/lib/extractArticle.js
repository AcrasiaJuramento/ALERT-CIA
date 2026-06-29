import * as cheerio from "cheerio";
import { normalizeUrl } from "./urls.js";

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonLdDates($) {
  const dates = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const payload = JSON.parse($(element).text());
      const nodes = Array.isArray(payload) ? payload : [payload];
      nodes.flatMap((node) => node?.['@graph'] || node).forEach((node) => {
        if (node?.datePublished) dates.push(node.datePublished);
      });
    } catch {
      // Ignore malformed JSON-LD blocks; metadata and time elements remain available.
    }
  });
  return dates[0] || null;
}

export function extractArticle(html, sourceUrl) {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, form, noscript").remove();
  const title = (
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text() ||
    $("title").text()
  ).trim() || null;
  const description = (
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") || ""
  ).trim();
  const articleRoot = $("article, [itemprop='articleBody'], .article-content, .entry-content, .post-content").first();
  const root = articleRoot.length ? articleRoot : $("main").first();
  const paragraphs = root.find("p").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get()
    .filter((text) => text.length > 30 && !/cookie|subscribe|newsletter/i.test(text));
  const publishedAt = validDate(
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    $('[itemprop="datePublished"]').first().attr("content") ||
    jsonLdDates($)
  );
  const canonical = normalizeUrl($('link[rel="canonical"]').attr("href") || sourceUrl, sourceUrl);

  return {
    title,
    snippet: description || paragraphs[0] || null,
    body: paragraphs.slice(0, 30).join("\n\n"),
    published_at: publishedAt,
    canonical_url: canonical,
  };
}
