const MONTHS = new Map([
  ["january", 0], ["jan", 0], ["enero", 0],
  ["february", 1], ["feb", 1], ["pebrero", 1],
  ["march", 2], ["mar", 2], ["marso", 2],
  ["april", 3], ["apr", 3], ["abril", 3],
  ["may", 4], ["mayo", 4],
  ["june", 5], ["jun", 5], ["hunyo", 5],
  ["july", 6], ["jul", 6], ["hulyo", 6],
  ["august", 7], ["aug", 7], ["agosto", 7],
  ["september", 8], ["sep", 8], ["sept", 8], ["setyembre", 8],
  ["october", 9], ["oct", 9], ["oktubre", 9],
  ["november", 10], ["nov", 10], ["nobyembre", 10],
  ["december", 11], ["dec", 11], ["disyembre", 11],
]);

const DAY_WORDS = new Map([
  ["una", 1], ["isa", 1], ["unang", 1], ["ikalawa", 2], ["dalawa", 2], ["dalawang", 2],
  ["ikatlo", 3], ["tatlo", 3], ["tatlong", 3], ["ikaapat", 4], ["apat", 4],
  ["ikalima", 5], ["lima", 5], ["limang", 5], ["ikaanim", 6], ["anim", 6],
  ["ikapito", 7], ["pito", 7], ["ikawalo", 8], ["walo", 8], ["ikasiyam", 9], ["siyam", 9],
  ["ikasampu", 10], ["sampu", 10],
]);

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function inferYear(referenceDate, monthIndex) {
  const reference = validDate(referenceDate) || new Date();
  let year = reference.getFullYear();
  if (monthIndex > reference.getMonth() && reference.getMonth() <= 1) year -= 1;
  return year;
}

function parseDate(text = "", referenceDate = null) {
  const monthNames = [...MONTHS.keys()].join("|");
  const monthDay = String(text).match(new RegExp(`\\b(?:nitong|noong|nuong|ng|on)?\\s*(?:ika-?)?(\\d{1,2}|${[...DAY_WORDS.keys()].join("|")})\\s+ng\\s+(${monthNames})(?:\\s+(\\d{4}))?\\b`, "i"));
  if (monthDay) {
    const day = DAY_WORDS.get(monthDay[1].toLowerCase()) || Number(monthDay[1]);
    const month = MONTHS.get(monthDay[2].toLowerCase());
    const year = Number(monthDay[3]) || inferYear(referenceDate, month);
    return { year, month, day, evidence: monthDay[0] };
  }

  const numeric = String(text).match(/\b(?:on|noong|nitong)?\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/i);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    const yearValue = numeric[3] ? Number(numeric[3]) : inferYear(referenceDate, month);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    return { year, month, day, evidence: numeric[0] };
  }

  const fallback = validDate(referenceDate);
  return fallback ? {
    year: fallback.getFullYear(),
    month: fallback.getMonth(),
    day: fallback.getDate(),
    evidence: "article published date",
  } : null;
}

function parseTime(text = "") {
  const value = String(text);
  const time = value.match(/\b(?:(?:pasado\s+)?alas[-\s]*(\d{1,2})(?::(\d{2}))?\s*(?:ng\s*)?(umaga|hapon|gabi|madaling\s+araw)?|(\d{1,2})(?::(\d{2}))\s*(am|pm)|(\d{1,2})\s*(?:ng\s*)?(umaga|hapon|gabi|madaling\s+araw))\b/i);
  if (!time) return null;

  let hour = Number(time[1] || time[4] || time[7]);
  const minute = Number(time[2] || time[5] || 0);
  const period = String(time[3] || time[6] || time[8] || "").toLowerCase();
  if (period.includes("hapon") || period.includes("gabi") || period === "pm") {
    if (hour < 12) hour += 12;
  } else if ((period.includes("umaga") || period.includes("madaling") || period === "am") && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, evidence: time[0] };
}

function likelyIncidentSentence(sentence = "") {
  return /\b(?:aksidente|nabangga|banggaan|salpukan|nasagasaan|nakuryente|nasugatan|patay|sugatan|accident|collision|crash|electrocuted|injured|killed)\b/i.test(sentence);
}

export function extractIncidentDateTime(text = "", referenceDate = null) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  const candidates = sentences.filter(likelyIncidentSentence);
  for (const sentence of [...candidates, ...sentences]) {
    const time = parseTime(sentence);
    if (!time) continue;
    const date = parseDate(sentence, referenceDate);
    if (!date) continue;
    const iso = new Date(Date.UTC(date.year, date.month, date.day, time.hour - 8, time.minute, 0)).toISOString();
    return {
      incident_at: iso,
      source: date.evidence === "article published date" ? "article_text_time_with_published_date" : "article_text",
      evidence: [time.evidence, date.evidence].filter(Boolean).join(" / "),
    };
  }
  return null;
}
