import * as cheerio from "cheerio";

export function extractLinks(html, base) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    let href = $(el).attr("href");

    if (!href) return;
    if (href.startsWith("javascript:") || href.startsWith("mailto:")) return;

    try {
      const url = new URL(href, base).toString();
      links.add(url.split("#")[0]);
    } catch {}
  });

  return [...links];
}