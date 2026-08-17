import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, markNotificationAsRead, markNotificationsAsRead, listNotifications, supabase } from '../services/supabase';
import { subscribeLiveSyncEvents } from '../network/live-sync-events';

const NOTIFICATION_PREFS_KEY = 'alert-cia-notification-preferences';
const NOTIFICATIONS_CACHE_KEY = 'alert-cia-notifications';
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

const NotificationContext = createContext();

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

function normalizeNotification(notification) {
  return {
    id: notification.id || `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: notification.type || 'system',
    title: notification.title || 'ALERT-CIA Update',
    message: notification.message || 'A system update was received.',
    timestamp: notification.timestamp || notification.created_at || new Date().toISOString(),
    read: Boolean(notification.read),
    responseId: notification.responseId || notification.response_id || null,
    dispatchId: notification.dispatchId || notification.dispatch_form_id || null,
    pcrId: notification.pcrId || notification.pcr_report_id || null,
    severity: notification.severity || notification.priority || 'normal',
    source: notification.source || 'app',
  };
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

function notificationFromLiveEvent(event) {
  const payload = event.detail?.payload || event.detail?.new || event.detail?.record || event.detail || {};
  const source = event.source || 'local';

  if (event.type === 'pcr_changed') {
    const status = payload.status || payload.record?.status || 'updated';
    return normalizeNotification({
      type: status === 'Submitted' || status === 'Submitted Locally' ? 'pcr_submitted' : 'pcr_updated',
      title: status === 'Submitted' || status === 'Submitted Locally' ? 'Patient Care Report Submitted' : 'Patient Care Report Updated',
      message: `${payload.responseNumber || payload.response_id || payload.responseId || 'A PCR record'} was ${String(status).toLowerCase()}.`,
      pcrId: payload.id || payload.pcrId || payload.pcr_id,
      responseId: payload.responseId || payload.response_id,
      source,
    });
  }

  if (event.type === 'dispatch_changed') {
    const status = payload.status || payload.record?.status || 'updated';
    return normalizeNotification({
      type: 'dispatch_updated',
      title: 'Dispatch Updated',
      message: `${payload.responseNumber || payload.response_id || payload.responseId || 'A dispatch'} is now ${status}.`,
      dispatchId: payload.id || payload.dispatchId || payload.dispatch_form_id,
      responseId: payload.responseId || payload.response_id,
      source,
    });
  }

  if (event.type === 'response_changed') {
    return normalizeNotification({
      type: 'incident_updated',
      title: 'Response Updated',
      message: `${payload.response_number || payload.id || 'A response'} changed in cloud records.`,
      responseId: payload.id || payload.response_id,
      source,
    });
  }

  return null;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [preferences, setPreferencesState] = useState(() => ({
    ...DEFAULT_PREFERENCES,
    ...readJson(NOTIFICATION_PREFS_KEY, {}),
  }));
  const [notifications, setNotifications] = useState(() =>
    readJson(NOTIFICATIONS_CACHE_KEY, []).map(normalizeNotification)
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
      const withoutDuplicate = prev.filter(item => item.id !== normalized.id);
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
        setNotifications(prev => persistNotifications([...rows.map(normalizeNotification), ...prev].filter(item => !item.read)));
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
        addNotification({ ...payload.new, source: 'cloud' });
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

  useEffect(() => subscribeLiveSyncEvents(event => {
    const notification = notificationFromLiveEvent(event);
    if (notification) addNotification(notification);
  }), [addNotification]);

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
