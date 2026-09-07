export function isPendingDispatch(record = {}) {
  const status = String(record.status || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return Boolean(record.responseId) && !record.acceptedAt && !record.resolvedAt
    && ['sent_to_responding_team', 'sent_to_field_officer'].includes(status);
}

export function dispatchAlertDetails(record = {}) {
  return [
    ['Incident', [...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(', ')],
    ['Description', record.notes || record.description || record.initialAssessment],
    ['Location', record.placeOfIncident || record.callerAddress],
    ['Barangay', record.barangay],
    ['Responding team', record.team],
    ['Caller', [record.callerName, record.callerContact].filter(Boolean).join(' • ')],
    ['Assistance needed', Array.isArray(record.assistanceNeeded) ? record.assistanceNeeded.join(', ') : record.assistanceNeeded],
  ].filter(([, value]) => value);
}
