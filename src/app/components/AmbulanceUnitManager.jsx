import { useCallback, useEffect, useState } from 'react';
import { Ambulance, Plus, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS } from '../access/rbac';
import {
  AMBULANCE_STATUSES,
  createAmbulanceUnit,
  getAmbulanceStatus,
  listAmbulanceUnits,
  supabase,
  updateAmbulanceUnitAvailability,
} from '../services/supabase';

const ambulanceStatusStyles = {
  available: 'bg-green-500/20 text-green-400',
  busy: 'bg-blue-500/20 text-blue-400',
  unavailable: 'bg-red-500/20 text-red-400',
  maintenance: 'bg-yellow-500/20 text-yellow-400',
};

const initialAmbulanceForm = {
  callSign: '',
  plateNumber: '',
  description: '',
  respondingTeamId: '',
  status: 'available',
};

export default function AmbulanceUnitManager({ respondingTeams = [] }) {
  const { can } = useAuth();
  const canManageAmbulances = can(PERMISSIONS.MANAGE_AMBULANCES);
  const [ambulanceUnits, setAmbulanceUnits] = useState([]);
  const [registerFormOpen, setRegisterFormOpen] = useState(false);
  const [ambulanceForm, setAmbulanceForm] = useState(initialAmbulanceForm);
  const [ambulanceSaving, setAmbulanceSaving] = useState(false);
  const [ambulanceLoading, setAmbulanceLoading] = useState(true);
  const [ambulanceError, setAmbulanceError] = useState('');

  const refreshAmbulanceUnits = useCallback(async () => {
    if (!canManageAmbulances) return [];
    setAmbulanceError('');
    const rows = await listAmbulanceUnits({ activeOnly: false });
    setAmbulanceUnits(rows);
    return rows;
  }, [canManageAmbulances]);

  const loadAmbulanceUnits = useCallback(async () => {
    if (!canManageAmbulances) return;
    setAmbulanceLoading(true);
    try {
      await refreshAmbulanceUnits();
    } catch (requestError) {
      setAmbulanceError(requestError.message || 'Unable to load ambulance units.');
    } finally {
      setAmbulanceLoading(false);
    }
  }, [canManageAmbulances, refreshAmbulanceUnits]);

  useEffect(() => {
    if (canManageAmbulances) loadAmbulanceUnits();
  }, [canManageAmbulances, loadAmbulanceUnits]);

  useEffect(() => {
    if (!canManageAmbulances || !supabase) return undefined;

    const channel = supabase
      .channel('user-management-ambulance-units')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_units' },
        () => {
          refreshAmbulanceUnits().catch((requestError) => {
            setAmbulanceError(requestError.message || 'Unable to refresh ambulance availability.');
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManageAmbulances, refreshAmbulanceUnits]);

  const availableAmbulances = ambulanceUnits.filter(unit => getAmbulanceStatus(unit) === 'available').length;
  const ambulanceTotal = ambulanceUnits.length;

  const updateUnitStatus = async (unitId, nextStatus) => {
    const previousUnits = ambulanceUnits;
    setAmbulanceError('');
    setAmbulanceUnits(current => current.map(unit => (
      unit.id === unitId ? { ...unit, status: nextStatus, active: nextStatus === 'available' } : unit
    )));

    try {
      const savedUnit = await updateAmbulanceUnitAvailability(unitId, nextStatus);
      setAmbulanceUnits(current => current.map(unit => (unit.id === unitId ? savedUnit : unit)));
    } catch (requestError) {
      setAmbulanceUnits(previousUnits);
      setAmbulanceError(requestError.message || 'Unable to update ambulance availability.');
    }
  };

  const registerAmbulance = async (event) => {
    event.preventDefault();
    if (!ambulanceForm.callSign.trim()) {
      setAmbulanceError('Ambulance unit name or number is required.');
      return;
    }

    setAmbulanceSaving(true);
    setAmbulanceError('');
    try {
      const unit = await createAmbulanceUnit({
        callSign: ambulanceForm.callSign.trim(),
        plateNumber: ambulanceForm.plateNumber.trim(),
        description: ambulanceForm.description.trim(),
        respondingTeamId: ambulanceForm.respondingTeamId || null,
        status: ambulanceForm.status,
      });
      setAmbulanceUnits(current => (
        current.some(existing => existing.id === unit.id)
          ? current.map(existing => (existing.id === unit.id ? unit : existing))
          : [...current, unit].sort((a, b) => a.call_sign.localeCompare(b.call_sign))
      ));
      setAmbulanceForm(initialAmbulanceForm);
      setRegisterFormOpen(false);
    } catch (requestError) {
      setAmbulanceError(requestError.message || 'Unable to register ambulance unit.');
    } finally {
      setAmbulanceSaving(false);
    }
  };

  if (!canManageAmbulances) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Ambulance className="h-4 w-4 text-green-400" />
            <h2 className="text-sm font-bold text-foreground">Ambulance Units</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Update unit availability and register ambulances used in dispatch and PCR forms.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{availableAmbulances}</span> available / <span className="font-semibold text-foreground">{ambulanceTotal}</span> total
          </div>
          <button
            type="button"
            onClick={() => setRegisterFormOpen(current => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {registerFormOpen ? 'Hide Form' : 'Register Unit'}
          </button>
          <button
            type="button"
            onClick={loadAmbulanceUnits}
            disabled={ambulanceLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-green-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${ambulanceLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {registerFormOpen && (
        <form onSubmit={registerAmbulance} className="mb-4 rounded-lg border border-border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs text-muted-foreground">
              Unit name or number
              <input
                value={ambulanceForm.callSign}
                onChange={(event) => setAmbulanceForm(current => ({ ...current, callSign: event.target.value }))}
                placeholder="Ambulance 01"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Plate number
              <input
                value={ambulanceForm.plateNumber}
                onChange={(event) => setAmbulanceForm(current => ({ ...current, plateNumber: event.target.value }))}
                placeholder="ABC 1234"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Status
              <select
                value={ambulanceForm.status}
                onChange={(event) => setAmbulanceForm(current => ({ ...current, status: event.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              >
                {AMBULANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Team assignment
              <select
                value={ambulanceForm.respondingTeamId}
                onChange={(event) => setAmbulanceForm(current => ({ ...current, respondingTeamId: event.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {respondingTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Description
              <input
                value={ambulanceForm.description}
                onChange={(event) => setAmbulanceForm(current => ({ ...current, description: event.target.value }))}
                placeholder="Optional notes"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={ambulanceSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {ambulanceSaving ? 'Registering...' : 'Register Ambulance'}
            </button>
          </div>
        </form>
      )}

      {ambulanceError && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{ambulanceError}</div>}

      {ambulanceLoading && (
        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-8 text-center text-sm text-muted-foreground">Loading ambulance units...</div>
      )}

      {!ambulanceLoading && !ambulanceUnits.length && (
        <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          <div>No ambulance units are registered in Supabase yet.</div>
          <button
            type="button"
            onClick={() => setRegisterFormOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Register First Unit
          </button>
        </div>
      )}

      {!ambulanceLoading && !!ambulanceUnits.length && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ambulanceUnits.map((unit) => (
            <div
              key={unit.id}
              className={`rounded-lg border p-3 transition-all ${
                getAmbulanceStatus(unit) === 'available'
                  ? 'border-green-500/30 bg-green-500/10'
                  : 'border-border bg-background'
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold text-foreground">{unit.call_sign}</span>
                  <span className="block text-xs text-muted-foreground">{unit.plate_number || unit.description || 'No plate number'}</span>
                  {unit.responding_team?.name && <span className="mt-1 block text-[10px] text-muted-foreground">Team: {unit.responding_team.name}</span>}
                </span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${ambulanceStatusStyles[getAmbulanceStatus(unit)]}`}>
                  {getAmbulanceStatus(unit)}
                </span>
              </div>
              <select
                value={getAmbulanceStatus(unit)}
                onChange={(event) => updateUnitStatus(unit.id, event.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
              >
                {AMBULANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
