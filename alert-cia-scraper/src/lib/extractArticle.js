import * as cheerio from "cheerio";

export function extractArticle(html) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    null;

  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 30);

  return {
    title,
    snippet: paragraphs[0] || null,
    body: paragraphs.slice(0, 10).join("\n\n"),
  };
}