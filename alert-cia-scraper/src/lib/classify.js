const TYPES = {
  vehicular: ["accident", "aksidente", "disgrasya", "nadisgrasya", "banggaan", "nagbanggaan", "nagkabanggaan", "salpukan", "sumalpok", "nasalpok", "nabangga", "bumangga", "tumaob", "tumagilid", "tumilapon", "nasagasaan", "sagasaan", "inararo", "nahulog sa bangin", "nawalan ng preno", "collision", "crash", "hit and run", "vehicular", "motorcycle", "motorsiklo", "truck accident", "bus accident"],
  fire: ["sunog", "fire", "blaze", "nasunog", "nagliyab", "tinupok ng apoy", "nilamon ng apoy"],
  flood: ["baha", "binaha", "pagbaha", "rumagasang tubig", "apaw", "flood", "flash flood", "overflowed"],
  landslide: ["landslide", "pagguho", "gumuho ang lupa", "gumuhong lupa", "mudslide"],
  robbery: ["holdap", "holdaper", "hold-up", "robbery", "nakawan", "ninakaw", "ninakawan", "nilooban", "tinangay", "hablot", "akyat-bahay", "theft", "stolen"],
  shooting: ["shooting", "pamamaril", "binaril", "nabaril", "pinagbabaril", "gunshot"],
  stabbing: ["stabbed", "stabbing", "pananaksak", "sinaksak", "nasaksak"],
  homicide: ["pinaslang", "pinatay", "pagpatay", "murder", "homicide"],
  drowning: ["drowned", "drowning", "nalunod"],
  rescue: ["rescue", "rescued", "sinagip", "iniligtas", "saklolo", "emergency", "missing person", "nawawala"],
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
