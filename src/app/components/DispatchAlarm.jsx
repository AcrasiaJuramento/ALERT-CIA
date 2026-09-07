import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptDispatchByResponse, listReceivedDispatchRecords } from '../services/supabase/dispatchService';
import { supabase } from '../services/supabase';
import { subscribeLiveSyncEvents } from '../network/live-sync-events';
import { dispatchAlertDetails, isPendingDispatch } from '../utils/pendingDispatch';

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
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const rows = await listReceivedDispatchRecords({ limit: 1000 });
        if (live) setPending(rows.filter(item => isPendingDispatch(item) && !accepted.current.has(item.responseId))
          .sort((a, b) => String(a.sentAt || a.createdAt).localeCompare(String(b.sentAt || b.createdAt))));
      } catch {
        // A failed refresh must never dismiss an outstanding dispatch.
      } finally { loading = false; }
    };
    refresh();
    const interval = window.setInterval(refresh, 5000);
    const unsubscribe = subscribeLiveSyncEvents(event => {
      if (['dispatch_changed', 'response_changed'].includes(event.type)) refresh();
    });
    const channel = supabase?.channel('field-dispatch-alarm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_forms' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener('focus', refresh);
      if (channel) supabase.removeChannel(channel);
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
