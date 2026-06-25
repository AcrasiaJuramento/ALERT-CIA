export function isRelevant(text) {
  const low = text.toLowerCase();

  const hasIsabela =
    low.includes("isabela") ||
    [
      "ilagan",
      "santiago",
      "cauayan",
      "tumauini",
      "alicia",
      "roxas",
      "jones",
      "san mateo",
      "echague",
    ].some((t) => low.includes(t));

  if (!hasIsabela) return false;

  const incidentWords = [
    "accident",
    "collision",
    "crash",
    "fire",
    "robbery",
    "hold-up",
    "stolen",
    "theft",
    "earthquake",
    "flood",
    "landslide",
    "injured",
    "killed",
    "died",
    "victim",
  ];

  return incidentWords.some((word) => low.includes(word));
}