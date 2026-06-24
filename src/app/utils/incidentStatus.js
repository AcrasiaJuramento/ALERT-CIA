export const INCIDENT_STATUS = {
  IN_ROUTE: 'in_route',
  ON_SCENE: 'on_scene',
  TRANSPORTING: 'transporting',
  COMPLETED: 'completed',
};

export const INCIDENT_STATUS_OPTIONS = [
  { value: INCIDENT_STATUS.IN_ROUTE, label: 'In route' },
  { value: INCIDENT_STATUS.ON_SCENE, label: 'On scene' },
  { value: INCIDENT_STATUS.TRANSPORTING, label: 'Transporting' },
  { value: INCIDENT_STATUS.COMPLETED, label: 'Completed' },
];

export const INCIDENT_STATUS_ORDER = INCIDENT_STATUS_OPTIONS.map((item) => item.value);

export function getIncidentStatusLabel(status) {
  return INCIDENT_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

export function isIncidentCompleted(status) {
  return status === INCIDENT_STATUS.COMPLETED;
}

export function isAmbulanceAssigned(status) {
  return [
    INCIDENT_STATUS.IN_ROUTE,
    INCIDENT_STATUS.ON_SCENE,
    INCIDENT_STATUS.TRANSPORTING,
  ].includes(status);
}
