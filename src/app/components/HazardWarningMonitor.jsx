import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LocateFixed, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from 'sonner';
import { listPublicHazardZones } from '../services/supabase';
import { useNotifications } from '../contexts/NotificationContext';
import { APPROACH_WARNING_METERS, RESET_BUFFER_METERS, distanceMeters, evaluateHazards, shouldNotify } from '../utils/hazardProximity';

const ZONE_CACHE_KEY = 'alert-cia-hazard-zones-v1';
const VOICE_KEY = 'alert-cia-hazard-voice';

function cachedZones() {
  try { return JSON.parse(localStorage.getItem(ZONE_CACHE_KEY) || '[]'); } catch { return []; }
}

function speak(message) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
}

export default function HazardWarningMonitor() {
  const { addNotification } = useNotifications();
  const [warning, setWarning] = useState(null);
  const [status, setStatus] = useState(() => navigator.geolocation ? 'starting' : 'unsupported');
  const [dismissedStatus, setDismissedStatus] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem(VOICE_KEY) !== 'false');
  const zonesRef = useRef(cachedZones());
  const stagesRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    listPublicHazardZones({ limit: 500 }).then(zones => {
      if (!active) return;
      zonesRef.current = zones;
      localStorage.setItem(ZONE_CACHE_KEY, JSON.stringify(zones));
    }).catch(() => {
      if (active && zonesRef.current.length) setStatus('offline');
    });
    return () => { active = false; };
  }, []);

  const processLocation = useCallback(position => {
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (Number.isFinite(accuracy) && accuracy > 150) {
      setStatus('weak');
      return;
    }
    setStatus(navigator.onLine ? 'active' : 'offline');
    const location = { latitude, longitude };
    const matches = evaluateHazards(location, zonesRef.current);
    const nearest = matches[0] || null;

    for (const zone of zonesRef.current) {
      const boundary = distanceMeters(location, zone) - Number(zone.radiusMeters || 250);
      if (boundary > APPROACH_WARNING_METERS + RESET_BUFFER_METERS) stagesRef.current.delete(String(zone.id));
    }

    setWarning(nearest);
    if (!nearest) return;
    const id = String(nearest.zone.id);
    const previous = stagesRef.current.get(id);
    stagesRef.current.set(id, nearest.level);
    if (!shouldNotify(previous, nearest.level)) return;

    const notification = {
      id: `hazard-${id}-${nearest.level}`,
      type: 'hazard_proximity',
      title: nearest.level === 'danger' ? 'DANGER — Accident-Prone Area' : 'Road Safety Warning',
      message: nearest.message,
      severity: nearest.level === 'danger' ? 'critical' : nearest.level === 'caution' ? 'high' : 'normal',
      source: 'gps',
    };
    addNotification(notification);
    toast[nearest.level === 'danger' ? 'error' : 'warning'](notification.title, { description: notification.message, id: notification.id, duration: nearest.level === 'danger' ? 12000 : 8000 });
    if (navigator.vibrate) navigator.vibrate(nearest.level === 'danger' ? [400, 150, 400] : [200]);
    if (voiceEnabled) speak(nearest.message);
  }, [addNotification, voiceEnabled]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(processLocation, error => {
      setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
    }, { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [processLocation]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem(VOICE_KEY, String(next));
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  if (!warning && (dismissedStatus === status || ['active', 'starting', 'offline'].includes(status))) return null;
  if (!warning) return <div role="status" className="fixed bottom-4 left-1/2 z-[1200] flex max-w-[94vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/40 bg-slate-950/95 py-2 pl-4 pr-2 text-sm text-amber-100 shadow-2xl"><LocateFixed className="h-4 w-4 shrink-0" /><span>{status === 'denied' ? 'Location permission denied. Enable it to receive accident-area warnings.' : status === 'weak' ? 'GPS signal is too weak for reliable safety warnings.' : status === 'unsupported' ? 'This browser does not support GPS monitoring.' : 'GPS is disabled or temporarily unavailable.'}</span><button type="button" onClick={() => setDismissedStatus(status)} aria-label="Dismiss GPS status" title="Dismiss" className="ml-1 rounded-lg p-1.5 text-amber-100 hover:bg-white/10"><X size={18} /></button></div>;

  const danger = warning.level === 'danger';
  return <div role="alert" aria-live="assertive" className={`fixed left-1/2 top-4 z-[1200] flex w-[min(94vw,720px)] -translate-x-1/2 items-start gap-3 rounded-2xl border p-4 shadow-2xl ${danger ? 'border-red-300 bg-red-700 text-white' : 'border-amber-300 bg-amber-500 text-slate-950'}`}>
    <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
    <div className="min-w-0 flex-1"><div className="font-black uppercase tracking-wide">{warning.zone.label || 'Accident-prone area'}</div><div className="font-semibold">{warning.message}</div></div>
    <button type="button" onClick={toggleVoice} aria-label={voiceEnabled ? 'Mute voice warnings' : 'Enable voice warnings'} className="rounded-lg p-2 hover:bg-black/10">{voiceEnabled ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>
    <button type="button" onClick={() => setWarning(null)} aria-label="Dismiss warning" className="rounded-lg p-2 hover:bg-black/10"><X size={19}/></button>
  </div>;
}
