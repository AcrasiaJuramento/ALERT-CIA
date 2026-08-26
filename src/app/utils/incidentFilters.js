const normalize = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const asList = value => Array.isArray(value) ? value : value ? [value] : [];

export function normalizeIncidentSeverity(value) {
  const severity = normalize(value);
  if (['red', 'critical', 'high', 'warning'].includes(severity)) return 'red';
  if (['yellow', 'medium', 'moderate'].includes(severity)) return 'yellow';
  if (['green', 'low', 'resolved'].includes(severity)) return 'green';
  return severity;
}

export function getIncidentTypeKeys(incident = {}) {
  const values = [
    ...asList(incident.filterTypes),
    ...asList(incident.natureTypes),
    ...asList(incident.emergencyTypes),
    ...asList(incident.traumaTypes),
    incident.natureOfCall,
    incident.incidentNature,
    incident.type,
    incident.classification,
    incident.subtype,
  ].filter(Boolean);
  const text = values.join(' | ').toLowerCase();
  const keys = new Set();

  if (text.includes('conduction')) keys.add('conduction');
  if (/motor vehicle crash|\bmvc\b|vehicular|vehicle crash|collision/.test(text)) keys.add('motor_vehicle_crash');
  if (text.includes('medical')) keys.add('medical');
  if (text.includes('trauma')) keys.add('trauma');

  return keys;
}

export function matchesIncidentFilters(incident, { severity = 'all', type = 'all', status = 'all' } = {}) {
  const matchesSeverity = severity === 'all'
    || normalizeIncidentSeverity(incident.severity || incident.triage || incident.priority) === severity;
  const matchesType = type === 'all' || getIncidentTypeKeys(incident).has(type);
  const matchesStatus = status === 'all' || normalize(incident.workflowStatus || incident.status) === normalize(status);

  return matchesSeverity && matchesType && matchesStatus;
}
