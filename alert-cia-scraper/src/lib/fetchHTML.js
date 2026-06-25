export async function fetchHTML(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (IsabelaScraper/1.0)",
      },
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}