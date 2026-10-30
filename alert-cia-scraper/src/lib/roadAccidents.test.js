import test from "node:test";
import assert from "node:assert/strict";
import { SOURCES } from "../constants/sources.js";
import { extractLinks } from "./extractLinks.js";
import { discoverArticleLinks } from "./discoverLinks.js";
import { ROAD_ACCIDENT_SEARCH_TERMS, matchesRoadAccidentSearch, isRoadAccidentReport } from "./roadAccidents.js";

test("every source uses the exact shared search terms", () => {
  for (const source of SOURCES) {
    assert.deepEqual(source.searchTerms, ["accidents", "aksidente", "banggan", "salpukan", "crash"], source.key);
    if (source.searchUrl) {
      for (const term of ROAD_ACCIDENT_SEARCH_TERMS) {
        assert.equal(new URL(source.searchUrl(term, 1)).searchParams.get("s"), term);
        assert.ok(source.searchUrl(term, 2).includes("/page/2/"));
      }
    }
  }
});

test("recognizes article wording without changing search query spelling", () => {
  for (const text of ["Road accident", "Bus accidents", "aksidente", "banggan", "banggaan", "nagbanggaan", "salpukan", "Car crashed"])
    assert.equal(matchesRoadAccidentSearch(text), true, text);
  for (const text of ["accidentally", "cash assistance", "Road improvements", "Vehicle sales"])
    assert.equal(matchesRoadAccidentSearch(text), false, text);
});

test("listing discovery excludes unrelated news before article downloads", () => {
  const source = SOURCES.find(item => item.key === "rmn");
  const links = extractLinks('<h2><a href="/local-government-project/">New government project</a></h2><h2><a href="/fatal-road-accident/">Road accident in Isabela</a></h2><h2><a href="/regional-report/">Banggaan ng dalawang bus</a></h2>', source.baseUrl, source);
  assert.deepEqual(links, ["https://rmn.ph/fatal-road-accident", "https://rmn.ph/regional-report"]);
});

test("article gate requires road context and excludes unrelated crash topics", () => {
  for (const text of ["Two killed in a road accident.", "Nasawi sa banggaan ng dalawang motorsiklo.", "Aksidente sa kalsada sa Isabela.", "Salpukan ng bus at truck."])
    assert.equal(isRoadAccidentReport(text), true, text);
  for (const text of ["Plane crash kills two.", "Computer crash affects vehicle registration.", "Road safety campaign prevents accidents.", "Car accident insurance seminar.", "Bus route opened in Isabela.", "Stocks crash hits car manufacturer."])
    assert.equal(isRoadAccidentReport(text), false, text);
});

test("API discovery filters article metadata using the shared terms", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: [
    { article_url: "https://example.test/article/1", title: "New local project" },
    { article_url: "https://example.test/article/2", title: "Road accidents in Isabela" },
  ] }), { status: 200 }));
  const source = { loadingStrategy: "api", apiUrl: "https://example.test/keyword-fixture", apiItemsPath: "data", apiUrlPath: "article_url",
    allowedDomains: ["example.test"], articlePattern: /\/article\/\d+/, searchTerms: ROAD_ACCIDENT_SEARCH_TERMS,
    discoveryLimits: { maxArticles: 20, maxRuntimeMs: 1000, maxScrolls: 1, noNewArticleLimit: 1, delayMs: 0 } };
  const result = await discoverArticleLinks(source, "update", { pages_checked: 0 }, { pages_checked: 0, links_found: 0 });
  assert.deepEqual(result.links, ["https://example.test/article/2"]);
});
