import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LocateFixed, Volume2, VolumeX, X } from 'lucide-react';
import { listPublicHazardZones } from '../services/supabase';
import { useNotifications } from '../contexts/NotificationContext';
import {
  DEFAULT_ZONE_RADIUS_METERS,
  EXIT_BUFFER_METERS,
  evaluateZoneTransitions,
  getZoneId,
} from '../utils/hazardProximity';
import { playAccidentAreaAlarm } from '../utils/warningAudio';
import { loadPublicAccidentIncidents } from '../utils/publicIncidentFeed';
import { calculateAccidentProneAreas } from '../utils/accidentProneAreas';
import { toAccidentProneWarningZone } from '../utils/accidentProneWarningZones';

const ZONE_CACHE_KEY = 'alert-cia-hazard-zones-v1';
const VOICE_KEY = 'alert-cia-hazard-voice';
const WARNING_MESSAGE = 'You are entering an accident-prone area. Please slow down and drive carefully.';

function cachedZones() {
  try {
    const value = JSON.parse(localStorage.getItem(ZONE_CACHE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function speak(message) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
}

function statusMessage(status) {
  if (status === 'denied') return 'Location permission denied. Enable it to receive accident-area warnings.';
  if (status === 'weak') return 'GPS accuracy is currently low. Accident-area monitoring is still active.';
  if (status === 'unsupported') return 'This browser does not support GPS monitoring.';
  if (status === 'timeout') return 'GPS location timed out. ALERT-CIA will keep trying automatically.';
  if (status === 'data-unavailable') return 'Accident-area data is temporarily unavailable.';
  return 'GPS is disabled or temporarily unavailable.';
}

export default function HazardWarningMonitor({ position, locationStatus = 'starting' }) {
  const { addNotification } = useNotifications();
  const [warnings, setWarnings] = useState([]);
  const [zoneDataStatus, setZoneDataStatus] = useState('loading');
  const [dismissedStatus, setDismissedStatus] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem(VOICE_KEY) !== 'false');
  const [audioStatus, setAudioStatus] = useState('idle');
  const zonesRef = useRef(cachedZones());
  const insideZoneIdsRef = useRef(new Set());
  const latestPositionRef = useRef(null);
  const addNotificationRef = useRef(addNotification);
  const voiceEnabledRef = useRef(voiceEnabled);

  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const playWarning = useCallback(async () => {
    setAudioStatus('pending');
    const played = await playAccidentAreaAlarm();
    setAudioStatus(played ? 'played' : 'blocked');
  }, []);

  const processLocation = useCallback((nextPosition) => {
    const { latitude, longitude } = nextPosition.coords || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    latestPositionRef.current = nextPosition;

    const transition = evaluateZoneTransitions(
      { latitude, longitude },
      zonesRef.current,
      insideZoneIdsRef.current,
      {
        defaultRadiusMeters: DEFAULT_ZONE_RADIUS_METERS,
        exitBufferMeters: EXIT_BUFFER_METERS,
      },
    );
    insideZoneIdsRef.current = transition.insideZoneIds;
    if (!transition.entered.length) return;

    const timestamp = Date.now();
    const enteredWarnings = transition.entered
      .sort((first, second) => first.centerDistance - second.centerDistance)
      .map(({ zone }, index) => ({
        eventId: `${getZoneId(zone)}-${timestamp}-${index}`,
        message: WARNING_MESSAGE,
        zone,
      }));

    setWarnings(current => [...current, ...enteredWarnings]);
    transition.entered.forEach(({ zone }, index) => {
      const areaName = zone.label || zone.name || 'Accident-prone area';
      addNotificationRef.current({
        id: `hazard-entry-${getZoneId(zone)}-${timestamp}-${index}`,
        type: 'hazard_proximity',
        title: 'WARNING - Accident-Prone Area',
        message: `${areaName}: ${WARNING_MESSAGE}`,
        severity: 'critical',
        source: 'gps',
      });
    });

    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
      navigator.vibrate([400, 150, 400]);
    }
    if (voiceEnabledRef.current) speak(WARNING_MESSAGE);
    playWarning();
  }, [playWarning]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listPublicHazardZones({ limit: 75 }).catch(() => []),
      loadPublicAccidentIncidents({ officialLimit: 150, scrapedLimit: 75, pcrLimit: 75 })
        .then(records => calculateAccidentProneAreas(records, { publicOnly: true }))
        .catch(() => []),
    ]).then(([registeredZones, calculatedAreas]) => {
      if (!active) return;
      const zones = [
        ...registeredZones.map(zone => ({ ...zone, warningSource: 'registered' })),
        ...calculatedAreas.map(toAccidentProneWarningZone),
      ];
      if (zones.length) {
        zonesRef.current = zones;
        setZoneDataStatus('active');
        localStorage.setItem(ZONE_CACHE_KEY, JSON.stringify(zones));
      } else {
        setZoneDataStatus(zonesRef.current.length ? 'cached' : 'unavailable');
      }
      if (latestPositionRef.current) processLocation(latestPositionRef.current);
    });
    return () => { active = false; };
  }, [processLocation]);

  useEffect(() => {
    if (position) processLocation(position);
  }, [position, processLocation]);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const warning = warnings[0] || null;
  const displayedStatus = ['denied', 'weak', 'unsupported', 'timeout', 'unavailable'].includes(locationStatus)
    ? locationStatus
    : zoneDataStatus === 'unavailable' ? 'data-unavailable' : null;

  const dismissWarning = () => {
    setWarnings(current => current.slice(1));
    setAudioStatus('idle');
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem(VOICE_KEY, String(next));
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  if (!warning) {
    if (!displayedStatus || dismissedStatus === displayedStatus) return null;
    return (
      <div role="status" className="fixed bottom-4 left-1/2 z-[2400] flex max-w-[94vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/40 bg-slate-950/95 py-2 pl-4 pr-2 text-sm text-amber-100 shadow-2xl">
        <LocateFixed className="h-4 w-4 shrink-0" />
        <span>{statusMessage(displayedStatus)}</span>
        <button type="button" onClick={() => setDismissedStatus(displayedStatus)} aria-label="Dismiss GPS status" title="Dismiss" className="ml-1 rounded-lg p-1.5 text-amber-100 hover:bg-white/10">
          <X size={18} />
        </button>
      </div>
    );
  }

  const areaName = warning.zone.label || warning.zone.name;

  return (
    <div className="fixed inset-0 z-[2400] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="accident-area-warning-title" aria-describedby="accident-area-warning-description" className="w-full max-w-lg overflow-hidden rounded-2xl border border-red-300 bg-card text-foreground shadow-2xl">
        <div className="bg-red-700 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 shrink-0" aria-hidden="true" />
            <h2 id="accident-area-warning-title" className="text-2xl font-black tracking-wide"><span aria-hidden="true">&#9888;&#65039;</span> WARNING</h2>
          </div>
        </div>
        <div className="space-y-4 p-5 text-center sm:p-6">
          {areaName && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-300">{areaName}</div>}
          <div id="accident-area-warning-description" className="space-y-1 text-base font-semibold sm:text-lg">
            <p>You are entering an accident-prone area.</p>
            <p>Please slow down and drive carefully.</p>
          </div>
          {audioStatus === 'blocked' && (
            <p className="text-xs text-muted-foreground">Your browser blocked automatic audio. The visual warning remains active.</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {audioStatus === 'blocked' && (
              <button type="button" onClick={playWarning} className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold hover:bg-secondary/80">
                <Volume2 size={17} /> Play alert sound
              </button>
            )}
            <button type="button" onClick={toggleVoice} aria-label={voiceEnabled ? 'Mute voice warnings' : 'Enable voice warnings'} className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold hover:bg-secondary/80">
              {voiceEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {voiceEnabled ? 'Voice on' : 'Voice off'}
            </button>
            <button type="button" onClick={dismissWarning} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700">
              Dismiss warning
            </button>
          </div>
          {warnings.length > 1 && <p className="text-xs text-muted-foreground">{warnings.length - 1} additional nearby area warning{warnings.length === 2 ? '' : 's'} queued.</p>}
        </div>
      </section>
    </div>
  );
}
