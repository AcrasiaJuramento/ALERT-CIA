function parseTimeToMinutes(value) {
  if (!value) return null;

  if (typeof value === 'number') return value;

  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes();
  }

  const text = String(value).trim();
  if (!text) return null;

  const [hours, minutes] = text.split(':').map(part => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

export function computeAverageResponseMinutes(records = []) {
  const validDurations = records
    .map(record => {
      const dispatchMinutes = parseTimeToMinutes(record.dispatchedTime || record.dispatchTime);
      const arrivalMinutes = parseTimeToMinutes(record.arrivalScene || record.arrivalAtScene || record.timeline?.arrivalScene);
      if (dispatchMinutes == null || arrivalMinutes == null) return null;
      return arrivalMinutes - dispatchMinutes;
    })
    .filter(value => value != null && value >= 0);

  if (!validDurations.length) return null;
  return Math.round(validDurations.reduce((total, value) => total + value, 0) / validDurations.length);
}

export function formatResponseDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '-';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
