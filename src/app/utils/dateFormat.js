export function formatLongDate(value, fallback = "-") {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || fallback
    : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function formatLongDateTime(value, fallback = "-") {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || fallback
    : `${formatLongDate(value, fallback)}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function formatDateAndTime(dateValue, timeValue = "") {
  const date = formatLongDate(dateValue);
  return [date, timeValue].filter(value => value && value !== "-").join(" ");
}
