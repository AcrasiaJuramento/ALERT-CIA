import { listAmbulanceUnits, listCrewMembers, listRespondingTeams } from './supabase/referenceService';

export const PCR_REFERENCE_CACHE_KEY = 'alert-cia:pcr-reference-options:v1';

export function readPCRReferenceCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PCR_REFERENCE_CACHE_KEY) || '{}');
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
      crew: Array.isArray(parsed.crew) ? parsed.crew : [],
    };
  } catch {
    return { teams: [], vehicles: [], crew: [] };
  }
}

export function writePCRReferenceCache(value) {
  localStorage.setItem(PCR_REFERENCE_CACHE_KEY, JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
}

function mergeManual(remote = [], cached = [], identity) {
  const merged = [...remote];
  cached.filter(item => item?.localManual).forEach(option => {
    if (!merged.some(item => identity(item) === identity(option))) merged.push(option);
  });
  return merged;
}

export async function refreshPCRReferenceCache() {
  const cached = readPCRReferenceCache();
  const [teamsResult, vehiclesResult, crewResult] = await Promise.allSettled([
    listRespondingTeams(),
    listAmbulanceUnits(),
    listCrewMembers(),
  ]);
  const next = {
    teams: teamsResult.status === 'fulfilled'
      ? mergeManual(teamsResult.value, cached.teams, item => String(item.name || '').trim().toLowerCase())
      : cached.teams,
    vehicles: vehiclesResult.status === 'fulfilled'
      ? mergeManual(vehiclesResult.value, cached.vehicles, item => String(item.call_sign || '').trim().toLowerCase())
      : cached.vehicles,
    crew: crewResult.status === 'fulfilled'
      ? mergeManual(crewResult.value, cached.crew, item => `${item.role}:${String(item.name || '').trim().toLowerCase()}`)
      : cached.crew,
  };
  if ([teamsResult, vehiclesResult, crewResult].some(result => result.status === 'fulfilled')) writePCRReferenceCache(next);
  return next;
}
