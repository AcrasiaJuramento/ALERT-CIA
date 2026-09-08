function clean(value) {
  const text = String(value ?? '').trim();
  return text && !['undefined', 'null'].includes(text.toLowerCase()) ? text : '';
}

function parts(values) {
  return values.map(clean).filter(Boolean).join(' | ');
}

export function formatNotificationDate(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? clean(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function notificationStatus(value) {
  const status = clean(value).toLowerCase();
  const labels = {
    sent_to_responding_team: 'Sent', accepted_by_responding_team: 'Accepted',
    pending_dispatcher_review: 'Submitted', pending_admin_verification: 'Submitted',
    submitted: 'Submitted', completed: 'Completed', pcr_completed: 'Completed', created: 'Created',
    verified: 'Verified', accepted_by_dispatcher: 'Accepted',
    returned_for_correction: 'Returned', returned_to_field_officer: 'Returned', rejected: 'Rejected',
    pcr_in_progress: 'In Progress', in_progress: 'In Progress',
  };
  return labels[status] || clean(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Updated';
}

function normalizedIncidentType(record = {}) {
  const response = record.response || record.responses || {};
  const raw = [
    ...(Array.isArray(record.traumaTypes) ? record.traumaTypes : []),
    ...(Array.isArray(record.emergencyTypes) ? record.emergencyTypes : []),
    record.incidentNature, record.incident_nature, record.typeOfIncident, record.type_of_incident,
    response.typeOfIncident, response.type_of_incident,
  ].map(clean).filter(Boolean)[0] || '';
  return /motor vehicle|vehicle crash|\bmvc\b/i.test(raw) ? 'MVC' : raw;
}

export function notificationAction(notification = {}, record = {}) {
  const original = `${notification.originalTitle || notification.title || ''} ${notification.originalMessage || notification.message || ''}`.toLowerCase();
  if (notification.type === 'pcr_created') return 'PCR created';
  if (/return|correction/.test(original)) return 'PCR returned';
  if (/reject/.test(original)) return 'PCR rejected';
  if (/verif/.test(original)) return 'PCR verified';
  if (/submit|pending review/.test(original)) return 'PCR submitted';
  if (/dispatch.*accept|accept.*dispatch/.test(original)) return 'Dispatch accepted';
  if (/dispatch.*sent|incoming dispatch/.test(original) || notification.type === 'dispatch_sent') return 'Dispatch sent';
  if (/response.*complet|returned to base/.test(original) || notification.type === 'response_completed') return 'Response completed';
  const status = notificationStatus(record.status).toLowerCase();
  if (notification.pcrId || String(notification.type).startsWith('pcr')) {
    if (status === 'verified') return 'PCR verified';
    if (status === 'submitted') return 'PCR submitted';
    if (status === 'returned') return 'PCR returned';
    if (status === 'rejected') return 'PCR rejected';
    return 'PCR updated';
  }
  if (notification.dispatchId || String(notification.type).startsWith('dispatch')) return status === 'accepted' ? 'Dispatch accepted' : 'Dispatch updated';
  return clean(notification.title) || 'ALERT-CIA update';
}

export function formatOperationalNotification(notification, record) {
  record ||= {};
  const response = record.response || record.responses || {};
  const location = record.barangay?.name || record.barangay || response.barangay?.name || response.barangay
    || record.placeOfIncident || record.place_of_incident || record.locationText || response.placeOfIncident || response.place_of_incident;
  const date = record.dateOfIncident || record.date_of_incident || response.dateOfIncident || response.date_of_incident;
  const team = record.respondingTeam || record.responding_team?.name || record.team || response.respondingTeam || response.responding_team?.name || response.team;
  const reference = record.responseNumber || record.response_number || response.responseNumber || response.response_number
    || (notification.pcrId ? `PCR-${String(notification.pcrId).slice(0, 8).toUpperCase()}` : '');
  const action = notificationAction(notification, record);
  const actionStatus = action.match(/\b(created|submitted|updated|verified|returned|rejected|accepted|sent|completed)$/i)?.[1];
  const status = actionStatus ? notificationStatus(actionStatus) : notificationStatus(record.status);
  const actor = /verified|returned|rejected/i.test(action) ? 'Administrator'
    : /dispatch sent/i.test(action) ? 'Dispatcher'
      : /pcr|dispatch accepted|response completed/i.test(action) ? 'Field Officer' : '';
  const title = parts([action, location, formatNotificationDate(date), normalizedIncidentType(record), team]);
  const message = parts([reference, status, actor]);
  return { ...notification, title: title || notification.title, message: message || notification.message };
}

export function notificationSemanticKey(item = {}) {
  const record = item.pcrId || item.pcr_report_id || item.dispatchId || item.dispatch_form_id || item.responseId || item.response_id || item.id;
  return parts([record, notificationAction(item), item.recipientProfileId || item.recipient_profile_id, item.recipientTeamId || item.recipient_team_id]).toLowerCase();
}

export function dedupeNotifications(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = notificationSemanticKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
