const wpSearch = (base, query = "isabela") => (page) =>
  page === 1 ? `${base}/?s=${encodeURIComponent(query)}` : `${base}/page/${page}/?s=${encodeURIComponent(query)}`;

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
    searchTerms: options.searchTerms || null,
    searchUrl: options.searchUrl || null,
    articleLinkSelector: options.articleLinkSelector || null,
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
  source("bombo", "Bombo Radyo Cauayan", "https://cauayan.bomboradyo.com", "https://cauayan.bomboradyo.com/?s=accidents", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://cauayan.bomboradyo.com", "accidents"),
    searchTerms: ["accidents", "aksidente", "banggan", "salpukan", "crash"],
    searchUrl: (term, page) => wpSearch("https://cauayan.bomboradyo.com", term)(page),
    articleLinkSelector: ".td-ss-main-content .td_module_wrap h3.entry-title a[rel='bookmark'], .td-ss-main-content h3.td-module-title a[rel='bookmark']",
  }),
];

export const ENABLED_SOURCES = SOURCES.filter((item) => item.enabled);
