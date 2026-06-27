const wpSearch = (base, query = "isabela") => (page) =>
  page === 1 ? `${base}/?s=${query}` : `${base}/page/${page}/?s=${query}`;

const wpCategory = (url) => (page) =>
  page === 1 ? url : `${url.replace(/\/$/, "")}/page/${page}/`;

const numberedPath = (base) => (page) => `${base.replace(/\/$/, "")}/${page}/`;

const inquirerGoogleSearch = (page) =>
  `https://www.inquirer.net/search/?q=isabela#gsc.tab=0&gsc.q=isabela&gsc.page=${page}`;

const queryPage = (url, parameter = "page") => (page) => {
  const target = new URL(url);
  if (page > 1) target.searchParams.set(parameter, String(page));
  return target.toString();
};

function source(key, name, baseUrl, firstPageUrl, options = {}) {
  return {
    key,
    name,
    baseUrl,
    firstPageUrl,
    paginationType: options.paginationType || "next_link",
    pageUrl: options.pageUrl || queryPage(firstPageUrl),
    maxPagesFull: options.maxPagesFull || 100,
    maxPagesUpdate: options.maxPagesUpdate || 3,
    allowedDomains: options.allowedDomains || [new URL(baseUrl).hostname.replace(/^www\./, "")],
    articlePattern: options.articlePattern || /\/[a-z0-9][a-z0-9-]+(?:\/|$)/i,
    enabled: options.enabled !== false,
  };
}

export const SOURCES = [
  source("gma", "GMA Network", "https://www.gmanetwork.com", "https://www.gmanetwork.com/news/tracking/isabela/1/", {
    paginationType: "numbered_path",
    pageUrl: numberedPath("https://www.gmanetwork.com/news/tracking/isabela"),
    maxPagesFull: 50,
    articlePattern: /\/news\/(?:topstories|regions|balitambayan)\/[^/]+\/\d+\//i,
  }),
  source("bombo", "Bombo Radyo", "https://news.bomboradyo.com", "https://news.bomboradyo.com/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://news.bomboradyo.com"),
  }),
  source("bombo_cauayan", "Bombo Radyo Cauayan", "https://cauayan.bomboradyo.com", "https://cauayan.bomboradyo.com/", {
    paginationType: "wordpress_home",
    pageUrl: wpCategory("https://cauayan.bomboradyo.com/"),
    maxPagesFull: 100,
  }),
  source("philstar", "Philstar", "https://www.philstar.com", "https://www.philstar.com/search/isabela%20accident", {
    paginationType: "query",
    pageUrl: queryPage("https://www.philstar.com/search/isabela%20accident"),
    articlePattern: /\/(?:nation|headlines|breaking-news|other-sections)\/\d{4}\/\d{2}\/\d{2}\//i,
  }),
  source("rappler", "Rappler", "https://www.rappler.com", "https://www.rappler.com/search/?q=Isabela", {
    paginationType: "query",
    pageUrl: queryPage("https://www.rappler.com/search/?q=Isabela"),
    articlePattern: /\/(?:nation|philippines|business|environment|latest)\/[a-z0-9-]+\/?$/i,
  }),
  source("inquirer", "Inquirer", "https://www.inquirer.net", inquirerGoogleSearch(1), {
    paginationType: "google_cse_hash",
    pageUrl: inquirerGoogleSearch,
    allowedDomains: ["inquirer.net"],
    articlePattern: /\/(?:\d+\/)?[a-z0-9][a-z0-9-]+\/?$/i,
  }),
  source("isabela_ppo", "Isabela PPO", "https://isabelappo.pro2.pnp.gov.ph", "https://isabelappo.pro2.pnp.gov.ph/category/news/", {
    paginationType: "wordpress_category",
    pageUrl: wpCategory("https://isabelappo.pro2.pnp.gov.ph/category/news/"),
    maxPagesFull: 50,
  }),
  // CNN Philippines shut down its news operations; retained disabled for configuration visibility.
  source("cnn_ph", "CNN Philippines", "https://cnnphilippines.com", "https://cnnphilippines.com/search/?q=isabela", { enabled: false }),
  source("manila_bulletin", "Manila Bulletin", "https://mb.com.ph", "https://mb.com.ph/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://mb.com.ph"),
  }),
  source("abs_cbn", "ABS-CBN", "https://news.abs-cbn.com", "https://news.abs-cbn.com/search-results?q=isabela", {
    paginationType: "query",
    pageUrl: queryPage("https://news.abs-cbn.com/search-results?q=isabela"),
    articlePattern: /\/(?:news|regions|business|lifestyle|spotlight)\/\d{4}\/\d{1,2}\/\d{1,2}\//i,
  }),
  source("dzrh", "DZRH", "https://dzrhnews.com.ph", "https://dzrhnews.com.ph/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://dzrhnews.com.ph"),
  }),
  source("tribune", "Daily Tribune", "https://tribune.net.ph", "https://tribune.net.ph/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://tribune.net.ph"),
  }),
  source("manila_times", "Manila Times", "https://www.manilatimes.net", "https://www.manilatimes.net/?s=isabela", {
    paginationType: "query",
    pageUrl: queryPage("https://www.manilatimes.net/?s=isabela"),
    articlePattern: /\/\d{4}\/\d{2}\/\d{2}\/(?:news|regions|latest-stories)\//i,
  }),
  source("daily_guardian", "Daily Guardian", "https://dailyguardian.com.ph", "https://dailyguardian.com.ph/?s=isabela", {
    paginationType: "wordpress_search",
    pageUrl: wpSearch("https://dailyguardian.com.ph"),
  }),
  source("brigada", "Brigada News", "https://www.brigadanews.ph", "https://www.brigadanews.ph/category/local-news/luzon/isabela/", {
    paginationType: "wordpress_category",
    pageUrl: wpCategory("https://www.brigadanews.ph/category/local-news/luzon/isabela/"),
    maxPagesFull: 50,
  }),
];

export const ENABLED_SOURCES = SOURCES.filter((item) => item.enabled);
