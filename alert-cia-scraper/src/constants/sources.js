import { ROAD_ACCIDENT_SEARCH_TERMS } from "../lib/roadAccidents.js";

const wpSearch = (base, query = "accidents") => (page) =>
  page === 1 ? `${base}/?s=${encodeURIComponent(query)}` : `${base}/page/${page}/?s=${encodeURIComponent(query)}`;

const queryPage = (url, parameter = "page") => (page) => {
  const target = new URL(url);
  if (page > 1) target.searchParams.set(parameter, String(page));
  return target.toString();
};

function source(key, name, baseUrl, firstPageUrl, options = {}) {
  const searchUrl = options.searchUrl || (options.wordpressSearch
    ? (term, page) => wpSearch(baseUrl, term)(page)
    : null);
  const loadingStrategy = options.loadingStrategy || (
    options.paginationType === "static" ? "static" : "pagination"
  );
  return {
    key,
    name,
    baseUrl,
    firstPageUrl: searchUrl ? searchUrl(ROAD_ACCIDENT_SEARCH_TERMS[0], 1) : firstPageUrl,
    loadingStrategy,
    paginationType: searchUrl ? "wordpress_search" : options.paginationType || "next_link",
    pageUrl: searchUrl ? (page) => searchUrl(ROAD_ACCIDENT_SEARCH_TERMS[0], page) : options.pageUrl || queryPage(firstPageUrl),
    apiUrl: options.apiUrl || null,
    apiItemsPath: options.apiItemsPath || null,
    apiUrlPath: options.apiUrlPath || null,
    apiArticleBaseUrl: options.apiArticleBaseUrl || null,
    apiBootstrapUrl: options.apiBootstrapUrl || null,
    apiBootstrapPagePath: options.apiBootstrapPagePath || null,
    apiDatePath: options.apiDatePath || null,
    loadMoreUrl: options.loadMoreUrl || null,
    scrollUrl: options.scrollUrl || firstPageUrl,
    searchTerms: ROAD_ACCIDENT_SEARCH_TERMS,
    searchUrl,
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
    searchUrl: (term, page) => wpSearch("https://cauayan.bomboradyo.com",  term)(page),
    articleLinkSelector: ".td-ss-main-content .td_module_wrap h3.entry-title a[rel='bookmark'], .td-ss-main-content h3.td-module-title a[rel='bookmark']",
    maxArticles: 160,
    maxRuntimeMs: 45_000,
    noNewArticleLimit: 3,
  }),
  source("gma", "GMA Isabela", "https://www.gmanetwork.com", "https://www.gmanetwork.com/news/tracking/isabela/", {
    loadingStrategy: "api",
    apiBootstrapUrl: "https://data.gmanetwork.com/gno/widgets/grid_reverse_listing/keyword_isabela/tracker.gz",
    apiBootstrapPagePath: "count",
    apiUrl: (page) => `https://data.gmanetwork.com/gno/widgets/grid_reverse_listing/keyword_isabela/${page}.gz`,
    apiItemsPath: "data",
    apiUrlPath: "article_url",
    apiArticleBaseUrl: "https://www.gmanetwork.com/news/",
    articlePattern: /\/news\/(?:topstories|regions|balitambayan|scitech)\/[^/]+\/\d+\//i,
    maxScrolls: 8,
    noNewArticleLimit: 8,
  }),
  source("dzrh", "DZRH News", "https://www.dzrh.com.ph", "https://www.dzrh.com.ph/tag/isabela-province", {
    loadingStrategy: "static",
    articleLinkSelector: 'a[href^="/post/"]',
    articlePattern: /\/post\/[a-z0-9][a-z0-9-]+$/i,
  }),
  source("brigada", "Brigada News Isabela", "https://www.brigadanews.ph", "https://www.brigadanews.ph/category/local-news/luzon/isabela/", {
    wordpressSearch: true,
    articleLinkSelector: "h2 a[href], h3 a[href], a[rel='bookmark']",
  }),
  source("rmn", "RMN Networks", "https://rmn.ph", "https://rmn.ph/", {
    wordpressSearch: true,
    articleLinkSelector: "h2 a[href], h3 a[href], a[rel='bookmark']",
  }),
];

export const ENABLED_SOURCES = SOURCES.filter((item) => item.enabled);
