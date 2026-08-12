const wpSearch = (base, query = "isabela") => (page) =>
  page === 1 ? `${base}/?s=${query}` : `${base}/page/${page}/?s=${query}`;

const queryPage = (url, parameter = "page") => (page) => {
  const target = new URL(url);
  if (page > 1) target.searchParams.set(parameter, String(page));
  return target.toString();
};

function source(key, name, baseUrl, firstPageUrl, options = {}) {
  const loadingStrategy = options.loadingStrategy || (
    options.paginationType === "static" ? "static" : "pagination"
  );
  return {
    key,
    name,
    baseUrl,
    firstPageUrl,
    loadingStrategy,
    paginationType: options.paginationType || "next_link",
    pageUrl: options.pageUrl || queryPage(firstPageUrl),
    apiUrl: options.apiUrl || null,
    apiItemsPath: options.apiItemsPath || null,
    apiUrlPath: options.apiUrlPath || null,
    apiDatePath: options.apiDatePath || null,
    loadMoreUrl: options.loadMoreUrl || null,
    scrollUrl: options.scrollUrl || firstPageUrl,
    discoveryLimits: {
      maxScrolls: options.maxScrolls || 8,
      maxArticles: options.maxArticles || 80,
      maxRuntimeMs: options.maxRuntimeMs || 25_000,
      noNewArticleLimit: options.noNewArticleLimit || 2,
      articleDateRangeDays: options.articleDateRangeDays || (options.loadingStrategy === "infinite_scroll" ? 120 : 365),
      delayMs: options.delayMs || 350,
    },
    maxPagesFull: options.maxPagesFull || 100,
    maxPagesUpdate: options.maxPagesUpdate || 3,
    allowedDomains: options.allowedDomains || [new URL(baseUrl).hostname.replace(/^www\./, "")],
    articlePattern: options.articlePattern || /\/[a-z0-9][a-z0-9-]+(?:\/|$)/i,
    enabled: options.enabled !== false,
  };
}

export const SOURCES = [
  source("bombo", "Bombo Radyo", "https://news.bomboradyo.com", "https://news.bomboradyo.com/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://news.bomboradyo.com"),
  }),
];

export const ENABLED_SOURCES = SOURCES.filter((item) => item.enabled);
