import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, DatabaseZap, Monitor, Radio, RotateCcw, Save, Volume2 } from 'lucide-react';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { checkConnection } from '../network/connection-manager';
import { checkLocalHealth } from '../network/health-checks';
import { getLocalServerConfig, localServerUrl, resetLocalServerConfig, saveLocalServerConfig } from '../services/device-service';
import { formatLongDateTime } from '../utils/dateFormat';
import { logAuditEvent } from '../services/supabase/auditService';

const tabs = [
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'local-server', label: 'Local Server', icon: Radio },
];

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500';
const labelClass = 'block text-xs font-semibold text-muted-foreground mb-1.5';

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-secondary border border-border'} disabled:opacity-50`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

function SettingRow({ icon, label, desc, checked, onChange, disabled }) {
  const RowIcon = icon;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-3.5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary">
          <RowIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function SaveBanner({ saved }) {
  if (!saved) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-500">
      <Check className="h-4 w-4" />
      Settings saved
    </div>
  );
}

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('notifications');
  const [saved, setSaved] = useState(false);
  const [localServer, setLocalServer] = useState({ protocol: 'http', host: '192.168.100.8', port: '4000', timeoutMs: 2500, discoveryEnabled: false, lastSuccessfulConnection: null });
  const [localTest, setLocalTest] = useState('');
  const { isDarkMode, setThemeMode } = useTheme();
  const {
    fontSizeIndex,
    setFontSizeIndex,
    zoomIndex,
    setZoomIndex,
    resetAll,
    fontLabel,
    zoomLabel,
  } = useAccessibility();
  const {
    preferences,
    updatePreferences,
    requestBrowserPermission,
    clearAll,
    notifications,
  } = useNotifications();

  const localServerOrigin = useMemo(() => localServerUrl(localServer), [localServer]);

  useEffect(() => {
    getLocalServerConfig().then(setLocalServer).catch(() => undefined);
  }, []);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const updateLocal = (key, value) => setLocalServer(current => ({ ...current, [key]: value }));

  const saveLocal = async () => {
    const next = await saveLocalServerConfig(localServer);
    setLocalServer(next);
    await checkConnection({ force: true });
    flashSaved();
    void logAuditEvent({ action: 'SETTINGS_UPDATED', module: 'SETTINGS', recordReference: 'local-server', description: 'Local server connection settings were updated.', platform: 'Web', metadata: { setting: 'local_server_connection' } });
  };

  const updateNotificationPreference = (key, value) => {
    const previous = preferences[key];
    updatePreferences({ [key]: value });
    void logAuditEvent({ action: 'SETTINGS_UPDATED', module: 'SETTINGS', recordReference: key, description: `${key} notification preference was updated.`, platform: 'Web', metadata: { setting: key, previous, next: value } });
  };

  const updateTheme = mode => {
    const previous = isDarkMode ? 'dark' : 'light';
    setThemeMode(mode);
    if (previous !== mode) void logAuditEvent({ action: 'SETTINGS_UPDATED', module: 'SETTINGS', recordReference: 'theme', description: 'Display theme was updated.', platform: 'Web', metadata: { setting: 'theme', previous, next: mode } });
  };

  const testLocal = async () => {
    setLocalTest('Testing connection...');
    const ok = await checkLocalHealth(localServer);
    if (!ok) {
      setLocalTest('Local ALERT-CIA server is unreachable.');
      return;
    }
    const next = await saveLocalServerConfig({ ...localServer, lastSuccessfulConnection: new Date().toISOString() });
    setLocalServer(next);
    setLocalTest('Local ALERT-CIA server connected.');
    await checkConnection({ force: true });
  };

  const resetLocal = async () => {
    const next = await resetLocalServerConfig();
    setLocalServer(next);
    setLocalTest('');
    flashSaved();
  };

  const enableBrowserNotifications = async value => {
    if (!value) {
      updateNotificationPreference('browserEnabled', false);
      return;
    }
    const permission = await requestBrowserPermission();
    if (permission !== 'granted') updateNotificationPreference('browserEnabled', false);
  };

  return (
    <div className="mx-auto min-h-full max-w-3xl bg-background p-5 transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Settings</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Configure working ALERT-CIA device settings.</p>
        </div>
        <SaveBanner saved={saved} />
      </div>

      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-secondary/50 p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-2 py-2.5 text-xs font-semibold transition ${activeTab === tab.id ? 'bg-blue-600 text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        {activeTab === 'notifications' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-foreground">Realtime Notifications</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Controls apply to cloud realtime events and local server events.</p>
            </div>
            <SettingRow icon={Bell} label="In-app notifications" desc="Show alerts in the notification drawer." checked={preferences.inAppEnabled} onChange={value => updateNotificationPreference('inAppEnabled', value)} />
            <SettingRow icon={Bell} label="PCR updates" desc="Notify when patient care reports are submitted or updated." checked={preferences.pcrEnabled} onChange={value => updateNotificationPreference('pcrEnabled', value)} />
            <SettingRow icon={Radio} label="Dispatch updates" desc="Notify when dispatch status changes locally or in cloud." checked={preferences.dispatchEnabled} onChange={value => updateNotificationPreference('dispatchEnabled', value)} />
            <SettingRow icon={DatabaseZap} label="Incident and response updates" desc="Notify when response records change in cloud." checked={preferences.incidentEnabled} onChange={value => updateNotificationPreference('incidentEnabled', value)} />
            <SettingRow icon={Volume2} label="Notification sound" desc="Play a short tone when a new allowed notification arrives." checked={preferences.soundEnabled} onChange={value => updateNotificationPreference('soundEnabled', value)} />
            <SettingRow icon={Bell} label="Browser popups" desc="Use the operating system browser notification permission." checked={preferences.browserEnabled} onChange={enableBrowserNotifications} />
            <SettingRow icon={Bell} label="Critical only" desc="Suppress normal updates and show only critical or urgent notifications." checked={preferences.criticalOnly} onChange={value => updateNotificationPreference('criticalOnly', value)} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">{notifications.length} notifications stored on this device.</div>
              <button type="button" onClick={clearAll} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary">
                Clear notification history
              </button>
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-foreground">Display and Accessibility</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">These preferences apply immediately on this device.</p>
            </div>
            <div className="grid gap-4">
              <div>
                <label className={labelClass}>Theme</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => updateTheme('light')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${!isDarkMode ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-secondary'}`}>Light</button>
                  <button type="button" onClick={() => updateTheme('dark')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${isDarkMode ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-secondary'}`}>Dark</button>
                </div>
              </div>
              <div>
                <label className={labelClass}>Text size: {fontLabel}</label>
                <input type="range" min="0" max="3" value={fontSizeIndex} onChange={event => setFontSizeIndex(Number(event.target.value))} className="w-full accent-blue-500" />
              </div>
              <div>
                <label className={labelClass}>Interface zoom: {zoomLabel}</label>
                <input type="range" min="0" max="3" value={zoomIndex} onChange={event => setZoomIndex(Number(event.target.value))} className="w-full accent-blue-500" />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary">
                  <RotateCcw className="h-4 w-4" />
                  Reset display settings
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'local-server' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-foreground">Local ALERT-CIA Server</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Used by tablets on the ALERT-CIA Wi-Fi when internet is unavailable.</p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Protocol</label>
                  <select className={inputClass} value={localServer.protocol} onChange={event => updateLocal('protocol', event.target.value)}>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Hostname or IP address</label>
                  <input className={inputClass} value={localServer.host} onChange={event => updateLocal('host', event.target.value)} placeholder="192.168.100.8" />
                </div>
                <div>
                  <label className={labelClass}>Port</label>
                  <input className={inputClass} value={localServer.port} onChange={event => updateLocal('port', event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Connection timeout</label>
                  <input type="number" min="500" step="250" className={inputClass} value={localServer.timeoutMs} onChange={event => updateLocal('timeoutMs', event.target.value)} />
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">Current local URL</div>
                  <div className="mt-1 break-all">{localServerOrigin}</div>
                  <div className="mt-2 font-semibold text-foreground">Last successful connection</div>
                  <div className="mt-1">{localServer.lastSuccessfulConnection ? formatLongDateTime(localServer.lastSuccessfulConnection) : 'Never'}</div>
                </div>
              </div>
              {localTest && <div className={`rounded-lg border px-3 py-2 text-xs ${localTest.includes('connected') ? 'border-green-500/30 bg-green-500/10 text-green-500' : localTest.includes('Testing') ? 'border-blue-500/30 bg-blue-500/10 text-blue-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>{localTest}</div>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={testLocal} className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold">Test Connection</button>
                <button type="button" onClick={resetLocal} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground">Reset</button>
                <button type="button" onClick={saveLocal} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
