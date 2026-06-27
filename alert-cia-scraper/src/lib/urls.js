const TRACKING_PARAMS = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source|output)$/i;
const BLOCKED_PATH = /\/(?:author|authors|tag|tags|category|categories|page|search|feed|login|register|privacy|terms|contact|about|advertise|video|videos|photo|photos|gallery|live)(?:\/|$)/i;
const BLOCKED_EXT = /\.(?:jpe?g|png|gif|webp|svg|pdf|mp4|mp3|zip|xml)(?:$|\?)/i;

export function normalizeUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    [...url.searchParams.keys()].forEach((key) => {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    });
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function domainAllowed(hostname, allowed = []) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isArticleUrl(value, source) {
  try {
    const url = new URL(value);
    if (!domainAllowed(url.hostname, source.allowedDomains)) return false;
    if (BLOCKED_PATH.test(url.pathname) || BLOCKED_EXT.test(url.pathname)) return false;
    if (url.pathname === "/" || url.pathname.length < 8) return false;
    return source.articlePattern.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}
