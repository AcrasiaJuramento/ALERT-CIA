const TYPES = {
  vehicular: ["accident", "aksidente", "banggaan", "salpukan", "nabangga", "bumangga", "tumaob", "collision", "crash", "hit and run", "vehicular", "motorcycle", "truck accident", "bus accident"],
  fire: ["sunog", "fire", "blaze", "nasunog"],
  flood: ["baha", "flood", "flash flood", "overflowed"],
  landslide: ["landslide", "pagguho", "mudslide"],
  robbery: ["holdap", "hold-up", "robbery", "nakawan", "theft", "stolen"],
  shooting: ["shooting", "binaril", "gunshot"],
  stabbing: ["stabbed", "stabbing", "sinaksak"],
  drowning: ["drowned", "drowning", "nalunod"],
  rescue: ["rescue", "rescued", "emergency", "missing person"],
};

export function classify(text) {
  const low = String(text || "").toLowerCase();
  let best = null;
  let score = 0;
  for (const [type, words] of Object.entries(TYPES)) {
    const matches = words.reduce((sum, word) => sum + (low.includes(word) ? 1 : 0), 0);
    if (matches > score) { best = type; score = matches; }
  }
  return best;
}

export function incidentTypeLabel(key) {
  return key ? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}
