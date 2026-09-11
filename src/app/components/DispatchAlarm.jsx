import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptDispatchByResponse, getPendingDispatchAlert, listPendingDispatchAlerts } from '../services/supabase/dispatchService';
import { getCurrentProfileTeamMemberships } from '../services/supabase/userService';
import { subscribeLiveSyncEvents } from '../network/live-sync-events';
import { dispatchAlertDetails, isPendingDispatch } from '../utils/pendingDispatch';

const FALLBACK_REFRESH_MS = 5 * 60_000;
const REFRESH_DEBOUNCE_MS = 750;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

// Mounted for the authenticated officer, independently of the current page.
export default function DispatchAlarm() {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const accepted = useRef(new Set());
  const accepting = useRef(false);
  const audio = useRef(null);
  const dialog = useRef(null);
  const record = pending[0];
  const ringing = Boolean(record);

  useEffect(() => {
    let live = true;
    let loading = false;
    let fallbackTimer;
    let retryTimer;
    let debounceTimer;
    let retryAttempt = 0;
    let lastErrorLogAt = 0;
    const teamIds = [];
    const changedResponseIds = new Set();
    let teamIdsLoaded = false;

    const logRefreshError = error => {
      const now = Date.now();
      if (now - lastErrorLogAt < 60_000) return;
      lastErrorLogAt = now;
      console.error('[dispatch-alarm] refresh failed:', error);
    };

    const scheduleFallback = () => {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') refreshAll();
      }, FALLBACK_REFRESH_MS);
    };

    const scheduleRetry = () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(retryTimer);
      const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          if (teamIdsLoaded) refreshAll();
          else initialize();
        }
      }, delay);
    };

    const applyRows = rows => {
      const next = rows.filter(item => isPendingDispatch(item) && !accepted.current.has(item.responseId));
      setPending(next.sort((a, b) => String(a.sentAt || a.createdAt).localeCompare(String(b.sentAt || b.createdAt))));
    };

    async function refreshAll() {
      if (loading) return;
      loading = true;
      try {
        if (!teamIds.length) {
          if (live) setPending([]);
          retryAttempt = 0;
          scheduleFallback();
          return;
        }
        const rows = await listPendingDispatchAlerts(teamIds);
        if (live) {
          applyRows(rows);
          retryAttempt = 0;
          window.clearTimeout(retryTimer);
          scheduleFallback();
        }
      } catch (error) {
        logRefreshError(error);
        if (live) scheduleRetry();
      } finally {
        loading = false;
      }
    }

    async function refreshChangedRows(responseIds) {
      if (loading || !responseIds.length || !teamIds.length) return;
      loading = true;
      try {
        const changedRows = await Promise.all(responseIds.map(async responseId => ({
          responseId,
          row: await getPendingDispatchAlert(responseId, teamIds),
        })));
        if (live) {
          setPending(items => {
            const next = new Map(items.map(item => [item.responseId, item]));
            changedRows.forEach(({ responseId, row }) => {
              next.delete(responseId);
              if (row && isPendingDispatch(row) && !accepted.current.has(row.responseId)) next.set(row.responseId, row);
            });
            return [...next.values()].sort((a, b) => String(a.sentAt || a.createdAt).localeCompare(String(b.sentAt || b.createdAt)));
          });
          retryAttempt = 0;
          window.clearTimeout(retryTimer);
          scheduleFallback();
        }
      } catch (error) {
        logRefreshError(error);
        if (live) scheduleRetry();
      } finally {
        loading = false;
      }
    }

    async function initialize() {
      try {
        const memberships = await getCurrentProfileTeamMemberships();
        teamIds.splice(0, teamIds.length, ...memberships.map(membership => membership.team_id).filter(Boolean));
        teamIdsLoaded = true;
        await refreshAll();
      } catch (error) {
        logRefreshError(error);
        if (live) scheduleRetry();
      }
    }

    const queueEventRefresh = event => {
      const detail = event.detail || {};
      const currentRow = detail.new || {};
      const previousRow = detail.old || {};
      const row = event.type === 'response_changed' ? currentRow : (currentRow.id ? currentRow : previousRow);
      const responseId = event.type === 'response_changed' ? row.id : (row.response_id || previousRow.response_id);
      const touchedTeamIds = [currentRow.responding_team_id, previousRow.responding_team_id].filter(Boolean);
      if (touchedTeamIds.length && !touchedTeamIds.some(teamId => teamIds.includes(teamId))) return;
      if (!responseId) {
        refreshAll();
        return;
      }
      changedResponseIds.add(responseId);
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const ids = [...changedResponseIds];
        changedResponseIds.clear();
        refreshChangedRows(ids);
      }, REFRESH_DEBOUNCE_MS);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };

    initialize();
    const unsubscribe = subscribeLiveSyncEvents(event => {
      if (['dispatch_changed', 'response_changed'].includes(event.type)) queueEventRefresh(event);
    });
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      live = false;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(retryTimer);
      window.clearTimeout(debounceTimer);
      unsubscribe();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!ringing) return undefined;
    const player = new Audio(`${import.meta.env.BASE_URL}audio/dispatch-alarm.mp3`);
    player.loop = true;
    player.volume = 1;
    audio.current = player;
    let live = true;
    const play = () => player.play().then(() => { if (live) setBlocked(false); })
      .catch(() => { if (live) setBlocked(true); });
    play();
    window.addEventListener('pointerdown', play);
    window.addEventListener('keydown', play);
    return () => {
      live = false;
      window.removeEventListener('pointerdown', play);
      window.removeEventListener('keydown', play);
      player.pause();
      player.src = '';
      audio.current = null;
    };
  }, [ringing]);

  useEffect(() => {
    if (record && !dialog.current?.open) dialog.current?.showModal();
  }, [record]);

  const accept = async () => {
    if (accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setError('');
    try {
      await acceptDispatchByResponse(record.responseId);
      accepted.current.add(record.responseId);
      setPending(items => items.filter(item => item.responseId !== record.responseId));
      navigate('/admin/dispatch/received', { state: { acceptedDispatch: record.responseId, acceptedAt: Date.now() } });
    } catch (failure) {
      setError(failure.message || 'Unable to accept dispatch. Please try again.');
    } finally { accepting.current = false; setBusy(false); }
  };

  if (!record) return null;
  return <dialog ref={dialog} onCancel={event => event.preventDefault()} aria-labelledby="dispatch-alarm-title"
    className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border-2 border-red-500 bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/80">
    <p className="text-sm font-bold uppercase tracking-widest text-red-500">Incoming dispatch{pending.length > 1 ? ` • ${pending.length} waiting` : ''}</p>
    <h2 id="dispatch-alarm-title" className="mt-2 text-2xl font-bold">{record.responseNumber || 'Emergency response assignment'}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Accept this dispatch to stop its alarm and open Received Dispatches.</p>
    <dl className="my-5 space-y-3">{dispatchAlertDetails(record).map(([label, value]) => <div key={label}>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value}</dd>
    </div>)}</dl>
    {blocked && <button className="mb-3 w-full rounded-lg border border-amber-500 p-3 font-semibold" onClick={() => audio.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}>Enable alarm sound</button>}
    {error && <p role="alert" className="mb-3 text-red-500">{error}</p>}
    <button autoFocus disabled={busy} onClick={accept} className="w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-60">{busy ? 'Accepting…' : 'Accept Dispatch'}</button>
  </dialog>;
}
