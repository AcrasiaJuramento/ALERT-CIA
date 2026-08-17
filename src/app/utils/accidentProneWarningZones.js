export function getAccidentProneAreaRadiusMeters(area = {}) {
  if (area.risk_level === 'Critical') return 520;
  if (area.risk_level === 'High') return 420;
  if (area.risk_level === 'Moderate') return 320;
  return 240;
}

export function toAccidentProneWarningZone(area = {}) {
  const areaName = area.barangay || area.area_label || area.municipality || 'Accident-prone area';
  const riskLabel = area.risk_level === 'Critical'
    ? 'Critical Road Safety Zone'
    : area.risk_level === 'High' ? 'Accident-Prone Area' : 'Caution Area';

  return {
    id: `calculated-${area.area_id || `${area.latitude}-${area.longitude}`}`,
    label: `${riskLabel}: ${areaName}`,
    type: 'accident_hotspot',
    severity: area.risk_level === 'Critical' ? 'critical' : 'high',
    latitude: Number(area.latitude),
    longitude: Number(area.longitude),
    radiusMeters: getAccidentProneAreaRadiusMeters(area),
    warningSource: 'calculated',
    riskLevel: area.risk_level,
  };
}
