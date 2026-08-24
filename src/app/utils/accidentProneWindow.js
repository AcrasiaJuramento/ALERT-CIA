export const ACCIDENT_PRONE_WINDOW_MONTHS = 36;

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function accidentProneWindowStart(referenceDate = new Date()) {
  const end = validDate(referenceDate) || new Date();
  return new Date(
    end.getFullYear(),
    end.getMonth() - ACCIDENT_PRONE_WINDOW_MONTHS,
    end.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function isWithinAccidentProneWindow(value, referenceDate = new Date()) {
  const date = validDate(value);
  const end = validDate(referenceDate) || new Date();
  if (!date) return false;
  return date >= accidentProneWindowStart(end) && date <= end;
}
