import * as cheerio from "cheerio";
import { isArticleUrl, normalizeUrl } from "./urls";

export function extractLinks(html, base, source) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    let href = $(el).attr("href");

    if (!href) return;
    if (href.startsWith("javascript:") || href.startsWith("mailto:")) return;

    try {
      const url = normalizeUrl(href, base);
      if (url && (!source || isArticleUrl(url, source))) links.add(url);
    } catch {
      // Ignore malformed href attributes from third-party markup.
    }
  });

  return [...links];
}

export function extractNextPage(html, base) {
  const $ = cheerio.load(html);
  const href = $('link[rel="next"]').attr("href") ||
    $('a[rel="next"], a.next, .next a, .nav-previous a, .pagination-next a').first().attr("href") ||
    $("a[href]").filter((_, el) => /^(?:next|older|susunod|›|»)/i.test($(el).text().trim())).first().attr("href");
  return href ? normalizeUrl(href, base) : null;
}
