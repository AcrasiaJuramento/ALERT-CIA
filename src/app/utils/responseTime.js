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

function parseRecordDateTime(date, value) {
  if (!date || !value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = /^\d{1,2}:\d{2}/.test(text)
    ? new Date(`${String(date).slice(0, 10)}T${text.slice(0, 8)}`)
    : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function completeWorkflowDuration(points) {
  if (points.some(point => !(point instanceof Date) || Number.isNaN(point.getTime()))) return null;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].getTime() < points[index - 1].getTime()) return null;
  }
  return (points[points.length - 1].getTime() - points[0].getTime()) / 60000;
}

export function computeAverageWholeResponseMinutes(records = []) {
  const validDurations = records.map(record => {
    const date = record.date || record.dateOfIncident || String(record.createdAt || '').slice(0, 10);
    const incident = parseRecordDateTime(date, record.timeOfIncident || record.time);
    const dispatched = parseRecordDateTime(date, record.dispatchedTime || record.dispatchTime);
    const accepted = parseRecordDateTime(date, record.acceptedAt);
    const sceneArrival = parseRecordDateTime(date, record.arrivalScene || record.arrivalAtScene);
    const sceneDeparture = parseRecordDateTime(date, record.departureScene || record.departureAtScene);
    const hospitalArrival = parseRecordDateTime(date, record.arrivalHospital || record.arrivalAtHospital);
    const hospitalDeparture = parseRecordDateTime(date, record.departureHospital || record.departureAtHospital);
    const backToBase = parseRecordDateTime(date, record.backToBase || record.arrivalOffice || record.arrivalAtOffice);
    const hasAnyHospitalTime = Boolean(hospitalArrival || hospitalDeparture);
    if (hospitalArrival && hospitalDeparture) {
      return completeWorkflowDuration([incident, dispatched, accepted, sceneArrival, sceneDeparture, hospitalArrival, hospitalDeparture, backToBase]);
    }
    if (!hasAnyHospitalTime) {
      return completeWorkflowDuration([incident, dispatched, accepted, sceneArrival, sceneDeparture, backToBase]);
    }
    return null;
  }).filter(value => Number.isFinite(value) && value >= 0);

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
