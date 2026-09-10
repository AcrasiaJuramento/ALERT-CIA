import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NotificationContext } from './notificationContextState';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, markNotificationAsRead, markNotificationsAsRead, listNotifications, supabase } from '../services/supabase';
import { getDispatchRecord, getDispatchRecordByResponse } from '../services/supabase/dispatchService';
import { dedupeNotifications, formatOperationalNotification, notificationSemanticKey } from '../utils/notificationPresentation';

const NOTIFICATION_PREFS_KEY = 'alert-cia-notification-preferences';
// Bump the key when the persisted notification shape changes. Older entries may
// be synthetic events without relational IDs, so they cannot be enriched safely.
const NOTIFICATIONS_CACHE_KEY = 'alert-cia-notifications-v3';
const MAX_NOTIFICATIONS = 80;

const DEFAULT_PREFERENCES = {
  inAppEnabled: true,
  browserEnabled: false,
  soundEnabled: true,
  criticalOnly: false,
  pcrEnabled: true,
  dispatchEnabled: true,
  incidentEnabled: true,
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function friendlyNotificationCopy(type) {
  const copy = {
    pcr_created: ['New PCR report', 'A patient care report is ready to be completed.'],
    pcr_submitted: ['PCR report submitted', 'A patient care report is ready for review.'],
    pcr_updated: ['PCR report updated', 'A patient care report has new information.'],
    dispatch_updated: ['Dispatch update', 'A response assignment has been updated.'],
    response_completed: ['Response completed', 'The response team has returned to base.'],
    incident_updated: ['Incident update', 'An incident record has new information.'],
  }[type];
  if (copy) {
    return copy;
  }
  return null;
}

function friendlySystemCopy(title, message) {
  const text = `${title || ''} ${message || ''}`.toLowerCase();
  if (text.includes('pending review') || text.includes('submitted a standalone pcr')) {
    return ['PCR submitted for review', 'A standalone PCR is waiting for dispatcher review.'];
  }
  if (text.includes('accepted by dispatcher')) {
    return ['PCR accepted', 'The PCR was accepted and is ready to be sent to a response team.'];
  }
  if (text.includes('returned for correction') || text.includes('returned to field')) {
    return ['PCR needs correction', 'Please update the PCR and submit it again.'];
  }
  return null;
}

function inferNotificationType(notification) {
  if (notification.type && notification.type !== 'system') return notification.type;
  const text = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
  if (text.includes('dispatch')) return 'dispatch_updated';
  if (text.includes('response') || text.includes('incident')) return 'incident_updated';
  if (text.includes('pcr')) return text.includes('submitted') ? 'pcr_submitted' : 'pcr_updated';
  return notification.type || 'system';
}

function linkedIdFromNotificationId(id, prefix) {
  const value = String(id || '');
  return value.startsWith(prefix) ? value.slice(prefix.length).replace(/-[^-]+$/, '') : null;
}

function normalizeNotification(notification) {
  const type = inferNotificationType(notification);
  const systemCopy = type === 'system' ? friendlySystemCopy(notification.title, notification.message) : null;
  return {
    id: notification.id || `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title: notification.title || systemCopy?.[0] || friendlyNotificationCopy(type)?.[0] || 'ALERT-CIA Update',
    message: notification.message || systemCopy?.[1] || friendlyNotificationCopy(type)?.[1] || 'There is a new update in ALERT-CIA.',
    originalTitle: notification.originalTitle || notification.title || '',
    originalMessage: notification.originalMessage || notification.message || '',
    timestamp: notification.timestamp || notification.created_at || new Date().toISOString(),
    read: Boolean(notification.read),
    responseId: notification.responseId || notification.response_id || linkedIdFromNotificationId(notification.id, 'live-response-'),
    dispatchId: notification.dispatchId || notification.dispatch_form_id || linkedIdFromNotificationId(notification.id, 'live-dispatch-'),
    pcrId: notification.pcrId || notification.pcr_report_id || null,
    severity: notification.severity || notification.priority || 'normal',
    source: notification.source || 'app',
  };
}

function isUnresolvedNotification(notification) {
  return ['incident_updated', 'dispatch_updated'].includes(notification.type)
    && ['Incident update', 'Dispatch update'].includes(notification.title);
}

function isCritical(notification) {
  return ['critical', 'high', 'urgent'].includes(String(notification.severity || '').toLowerCase())
    || String(notification.title || '').toLowerCase().includes('critical');
}

function allowedByPreferences(notification, preferences) {
  if (!preferences.inAppEnabled) return false;
  if (preferences.criticalOnly && !isCritical(notification)) return false;
  if (notification.type?.startsWith('pcr') && !preferences.pcrEnabled) return false;
  if (notification.type?.startsWith('dispatch') && !preferences.dispatchEnabled) return false;
  if (notification.type?.startsWith('incident') && !preferences.incidentEnabled) return false;
  return true;
}

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);
  } catch {
    // Sound is best-effort only.
  }
}

function showBrowserNotification(notification) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(notification.title, {
      body: notification.message,
      tag: notification.id,
      icon: '/favicon.svg',
    });
  } catch {
    // Browser notifications can be blocked by platform policy.
  }
}

async function getNotificationResponse(responseId) {
  if (!responseId || !supabase) return null;
  const { data, error } = await supabase
    .from('responses')
    .select('id, response_number, date_of_incident, place_of_incident, location_text, type_of_incident, status, barangay:barangays(name), responding_team:responding_teams!responses_responding_team_id_fkey(name)')
    .eq('id', responseId)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function getNotificationPCR(pcrId) {
  if (!pcrId || !supabase) return null;
  const { data, error } = await supabase
    .from('pcr_reports')
    .select('id, response_id, status, incident_nature, emergency_types, trauma_types, responding_team:responding_teams!pcr_reports_responding_team_id_fkey(name), response:responses(id, response_number, date_of_incident, place_of_incident, location_text, type_of_incident, status, barangay:barangays(name), responding_team:responding_teams!responses_responding_team_id_fkey(name))')
    .eq('id', pcrId)
    .maybeSingle();
  return error ? null : data;
}

async function enrichNotification(notification) {
  if (notification.pcrId) {
    const report = await getNotificationPCR(notification.pcrId);
    const action = notification.type === 'pcr_submitted' ? 'Submitted' : 'Updated';
    if (report) return formatOperationalNotification({ ...notification, fallbackAction: action }, report);
  }
  if (notification.dispatchId || notification.responseId) {
    const record = notification.dispatchId
      ? await getDispatchRecord(notification.dispatchId).catch(() => null)
      : await getDispatchRecordByResponse(notification.responseId).catch(() => null);
    if (record) return formatOperationalNotification(notification, record);
    const response = await getNotificationResponse(notification.responseId);
    return response ? formatOperationalNotification(notification, response) : formatOperationalNotification(notification, null);
  }
  if (notification.pcrId) return formatOperationalNotification(notification, null);
  if (['incident_updated', 'dispatch_updated'].includes(notification.type)) return null;
  return notification;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [preferences, setPreferencesState] = useState(() => ({
    ...DEFAULT_PREFERENCES,
    ...readJson(NOTIFICATION_PREFS_KEY, {}),
  }));
  const [notifications, setNotifications] = useState(() =>
    readJson(NOTIFICATIONS_CACHE_KEY, []).map(normalizeNotification).filter(item => !isUnresolvedNotification(item))
  );

  const persistNotifications = useCallback(next => {
    const clipped = next.slice(0, MAX_NOTIFICATIONS);
    saveJson(NOTIFICATIONS_CACHE_KEY, clipped);
    return clipped;
  }, []);

  const addNotification = useCallback(notification => {
    const normalized = normalizeNotification(notification);
    if (!allowedByPreferences(normalized, preferences)) return null;

    setNotifications(prev => {
      const semanticKey = notificationSemanticKey(normalized);
      const withoutDuplicate = prev.filter(item => item.id !== normalized.id && notificationSemanticKey(item) !== semanticKey);
      return persistNotifications([normalized, ...withoutDuplicate]);
    });

    // Hazard proximity warnings use their own multi-tone alarm and autoplay fallback.
    if (preferences.soundEnabled && normalized.type !== 'hazard_proximity') playNotificationSound();
    if (preferences.browserEnabled) showBrowserNotification(normalized);
    return normalized;
  }, [persistNotifications, preferences]);

  useEffect(() => {
    saveJson(NOTIFICATION_PREFS_KEY, preferences);
  }, [preferences]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined;
    let mounted = true;
    listNotifications({ unreadOnly: true, limit: 50 })
      .then(rows => {
        if (!mounted) return;
        Promise.all(rows.map(row => enrichNotification(normalizeNotification(row)))).then(enrichedRows => {
          if (!mounted) return;
          setNotifications(prev => {
            const merged = new Map([...prev, ...enrichedRows.filter(Boolean)].map(item => [item.id, item]));
            return persistNotifications(dedupeNotifications([...merged.values()].filter(item => !item.read && !isUnresolvedNotification(item))));
          });
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [persistNotifications, user]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) return undefined;
    const channel = supabase
      .channel(`alert-cia-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        const notification = normalizeNotification({ ...payload.new, source: 'cloud' });
        enrichNotification(notification).then(enriched => enriched && addNotification(enriched));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, payload => {
        const updated = normalizeNotification({ ...payload.new, source: 'cloud' });
        setNotifications(prev => persistNotifications(updated.read
          ? prev.filter(item => item.id !== updated.id)
          : prev.map(item => item.id === updated.id ? updated : item)
        ));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [addNotification, persistNotifications, user]);

  const markAsRead = useCallback(id => {
    setNotifications(prev => persistNotifications(prev.filter(item => item.id !== id)));
    markNotificationAsRead(id).catch(() => undefined);
  }, [persistNotifications]);

  const markAllAsRead = useCallback(() => {
    const unreadIds = notifications.filter(item => !item.read).map(item => item.id);
    setNotifications(prev => persistNotifications(prev.filter(item => item.read)));
    markNotificationsAsRead(unreadIds).catch(() => undefined);
  }, [notifications, persistNotifications]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveJson(NOTIFICATIONS_CACHE_KEY, []);
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported';
    const permission = await Notification.requestPermission();
    setPreferencesState(current => ({ ...current, browserEnabled: permission === 'granted' }));
    return permission;
  }, []);

  const updatePreferences = useCallback(patch => {
    setPreferencesState(current => ({ ...current, ...patch }));
  }, []);

  const unreadCount = notifications.filter(item => !item.read).length;

  const value = useMemo(() => ({
    notifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    unreadCount,
    preferences,
    updatePreferences,
    requestBrowserPermission,
  }), [notifications, addNotification, markAsRead, markAllAsRead, clearAll, unreadCount, preferences, updatePreferences, requestBrowserPermission]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
