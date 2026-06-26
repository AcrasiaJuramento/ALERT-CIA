export const INCIDENT_STATUS = {
  IN_ROUTE: 'in_route',
  ON_SCENE: 'on_scene',
  TRANSPORTING: 'transporting',
  COMPLETED: 'completed',
  DISPATCHED: 'dispatched',
  SENT_TO_RESPONDING_TEAM: 'sent_to_responding_team',
  ACCEPTED_BY_RESPONDING_TEAM: 'accepted_by_responding_team',
  PCR_IN_PROGRESS: 'pcr_in_progress',
  PCR_COMPLETED: 'pcr_completed',
  CANCELLED: 'cancelled',
};

export const INCIDENT_STATUS_OPTIONS = [
  { value: INCIDENT_STATUS.IN_ROUTE, label: 'In route' },
  { value: INCIDENT_STATUS.ON_SCENE, label: 'On scene' },
  { value: INCIDENT_STATUS.TRANSPORTING, label: 'Transporting' },
  { value: INCIDENT_STATUS.COMPLETED, label: 'Completed' },
];

const STATUS_LABELS = {
  [INCIDENT_STATUS.IN_ROUTE]: 'In route',
  [INCIDENT_STATUS.ON_SCENE]: 'On scene',
  [INCIDENT_STATUS.TRANSPORTING]: 'Transporting',
  [INCIDENT_STATUS.COMPLETED]: 'Completed',
  draft: 'Draft',
  [INCIDENT_STATUS.DISPATCHED]: 'Dispatched',
  [INCIDENT_STATUS.SENT_TO_RESPONDING_TEAM]: 'Sent to responding team',
  [INCIDENT_STATUS.ACCEPTED_BY_RESPONDING_TEAM]: 'Accepted by responding team',
  [INCIDENT_STATUS.PCR_IN_PROGRESS]: 'PCR in progress',
  [INCIDENT_STATUS.PCR_COMPLETED]: 'PCR completed',
  [INCIDENT_STATUS.CANCELLED]: 'Cancelled',
};

const COMPLETED_STATUSES = new Set([
  INCIDENT_STATUS.COMPLETED,
  INCIDENT_STATUS.PCR_COMPLETED,
]);

const ACTIVE_RESPONSE_STATUSES = new Set([
  INCIDENT_STATUS.IN_ROUTE,
  INCIDENT_STATUS.ON_SCENE,
  INCIDENT_STATUS.TRANSPORTING,
  INCIDENT_STATUS.DISPATCHED,
  INCIDENT_STATUS.SENT_TO_RESPONDING_TEAM,
  INCIDENT_STATUS.ACCEPTED_BY_RESPONDING_TEAM,
  INCIDENT_STATUS.PCR_IN_PROGRESS,
]);

export const INCIDENT_STATUS_ORDER = INCIDENT_STATUS_OPTIONS.map((item) => item.value);

export function getIncidentStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function isIncidentCompleted(status) {
  return COMPLETED_STATUSES.has(status);
}

export function isAmbulanceAssigned(status) {
  return ACTIVE_RESPONSE_STATUSES.has(status);
}
