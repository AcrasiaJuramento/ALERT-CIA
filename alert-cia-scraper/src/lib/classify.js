import { INCIDENT_TYPES } from "@/constants/incidentTypes";
import { VEHICULAR_TYPES } from "@/constants/vehicularTypes";

export function classify(text) {
  const low = text.toLowerCase();

  let bestMatch = null;
  let highestScore = 0;

  // ---------------- VEHICULAR ----------------
  for (const [type, keywords] of Object.entries(VEHICULAR_TYPES)) {
    let score = 0;

    for (const keyword of keywords) {
      if (low.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = "vehicular";
    }
  }

  // ---------------- INCIDENTS ----------------
  for (const [type, keywords] of Object.entries(INCIDENT_TYPES)) {
    let score = 0;

    for (const keyword of keywords) {
      if (low.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = type;
    }
  }

  return highestScore > 0 ? bestMatch : "unknown";
}