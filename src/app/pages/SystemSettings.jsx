import { useState } from 'react';
import {
  Bell, Map, Brain, User, Save, Shield, Volume2,
  Mail, Phone, Globe, Sliders, Radio, AlertTriangle
} from 'lucide-react';

const tabs = [
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'map', label: 'Map Config', icon: Map },
  { id: 'ai', label: 'AI Prediction', icon: Brain },
  { id: 'preferences', label: 'User Preferences', icon: User },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-all shrink-0 ${
        checked ? 'bg-blue-600' : 'bg-secondary border border-border'
      }`}
      style={{ height: '22px', width: '40px' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0'
        }`}
        style={{ width: '18px', height: '18px' }}
      />
    </button>
  );
}

function SettingRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

const inputClass = 'w-full px-3 py-2.5 bg-input-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500 transition-all';
const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('notifications');
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    // Notifications
    criticalAlerts: true,
    warningAlerts: true,
    incidentUpdates: true,
    dispatchNotifs: true,
    emailAlerts: true,
    smsAlerts: false,
    soundAlerts: true,
    browserNotifs: true,
    // Map
    satelliteDefault: false,
    heatmapEnabled: true,
    dangerZones: true,
    autoRefresh: true,
    clusterMarkers: true,
    trafficLayer: false,
    // AI
    aiPredictions: true,
    hotspotHighlight: true,
    riskAlerts: true,
    autoReroute: false,
    weeklyReports: true,
    // Preferences
    darkMode: true,
    compactView: false,
    autoLogout: true,
    showCoordinates: false,
    notifSound: true,
    twelveHourClock: false,
  });

  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-5 max-w-3xl mx-auto bg-background min-h-full transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          System Settings
        </h1>
        <p className="text-muted-foreground text-xs mt-0.5">Configure ALERT-CIA system preferences and behavior</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 border border-border rounded-xl p-1 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === id ? 'bg-blue-600 text-white shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border rounded-2xl p-5 transition-colors duration-300">
        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-0">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-0.5">Alert Notifications</h3>
              <p className="text-xs text-muted-foreground">Configure how you receive emergency alerts and updates</p>
            </div>
            <SettingRow icon={AlertTriangle} label="Critical Incident Alerts" desc="Receive immediate alerts for critical emergencies" checked={settings.criticalAlerts} onChange={v => update('criticalAlerts', v)} />
            <SettingRow icon={Bell} label="Warning Level Alerts" desc="Notifications for warning severity incidents" checked={settings.warningAlerts} onChange={v => update('warningAlerts', v)} />
            <SettingRow icon={Radio} label="Incident Status Updates" desc="Updates when incident status changes" checked={settings.incidentUpdates} onChange={v => update('incidentUpdates', v)} />
            <SettingRow icon={Radio} label="Dispatch Notifications" desc="Alerts when teams are dispatched or arrive on scene" checked={settings.dispatchNotifs} onChange={v => update('dispatchNotifs', v)} />

            <div className="py-3 border-b border-border/50">
              <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">Notification Channels</h4>
              <SettingRow icon={Mail} label="Email Alerts" desc="Send incident alerts to registered email" checked={settings.emailAlerts} onChange={v => update('emailAlerts', v)} />
            </div>
            <SettingRow icon={Phone} label="SMS Alerts" desc="Receive SMS for critical incidents (carrier charges may apply)" checked={settings.smsAlerts} onChange={v => update('smsAlerts', v)} />
            <SettingRow icon={Volume2} label="Sound Alerts" desc="Play audio notification on new incidents" checked={settings.soundAlerts} onChange={v => update('soundAlerts', v)} />
            <SettingRow icon={Globe} label="Browser Notifications" desc="Show desktop notification popups" checked={settings.browserNotifs} onChange={v => update('browserNotifs', v)} />

            <div className="mt-5 pt-4 border-t border-border">
              <label className={labelClass}>Alert Email Recipients</label>
              <input
                type="text"
                defaultValue="admin.santos@mdrrmo.gov.ph, dispatch@mdrrmo.gov.ph"
                className={inputClass}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1">Separate multiple emails with commas</p>
            </div>
          </div>
        )}

        {/* Map Config */}
        {activeTab === 'map' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-0.5">Map Display Configuration</h3>
              <p className="text-xs text-muted-foreground">Customize map appearance and real-time features</p>
            </div>
            <SettingRow icon={Map} label="Satellite View Default" desc="Start map in satellite mode by default" checked={settings.satelliteDefault} onChange={v => update('satelliteDefault', v)} />
            <SettingRow icon={Map} label="Heatmap Layer" desc="Show incident density heatmap overlay" checked={settings.heatmapEnabled} onChange={v => update('heatmapEnabled', v)} />
            <SettingRow icon={Shield} label="Danger Zone Overlay" desc="Display hazard zone boundaries on map" checked={settings.dangerZones} onChange={v => update('dangerZones', v)} />
            <SettingRow icon={Radio} label="Auto-Refresh Map" desc="Automatically update map with new incidents" checked={settings.autoRefresh} onChange={v => update('autoRefresh', v)} />
            <SettingRow icon={Map} label="Cluster Markers" desc="Group nearby markers at lower zoom levels" checked={settings.clusterMarkers} onChange={v => update('clusterMarkers', v)} />
            <SettingRow icon={Map} label="Traffic Layer" desc="Show live traffic conditions on map" checked={settings.trafficLayer} onChange={v => update('trafficLayer', v)} />

            <div className="mt-5 pt-4 border-t border-border space-y-4">
              <div>
                <label className={labelClass}>Default Map Center</label>
                <input type="text" defaultValue="16.7023° N, 121.6722° E (Echague, Isabela)" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Map Refresh Interval</label>
                <select className={inputClass}>
                  <option>Every 10 seconds</option>
                  <option>Every 30 seconds</option>
                  <option>Every 1 minute</option>
                  <option>Manual only</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Default Zoom Level</label>
                <input type="range" min="10" max="18" defaultValue="14" className="w-full accent-blue-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                  <span>Town</span>
                  <span>City</span>
                  <span>Street</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Settings */}
        {activeTab === 'ai' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-0.5">AI Spatial-Temporal Intelligence</h3>
              <p className="text-xs text-muted-foreground">Configure AI prediction and analysis settings</p>
            </div>
            <div className="p-3 mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-blue-400 font-medium">AI Model Status: <strong className="text-green-400">Active</strong> — Confidence: 87%</span>
              </div>
            </div>
            <SettingRow icon={Brain} label="AI Predictive Analysis" desc="Enable spatial-temporal AI accident prediction" checked={settings.aiPredictions} onChange={v => update('aiPredictions', v)} />
            <SettingRow icon={AlertTriangle} label="Hotspot Highlighting" desc="Automatically highlight predicted accident zones" checked={settings.hotspotHighlight} onChange={v => update('hotspotHighlight', v)} />
            <SettingRow icon={Bell} label="Predictive Risk Alerts" desc="Alert dispatchers of upcoming high-risk periods" checked={settings.riskAlerts} onChange={v => update('riskAlerts', v)} />
            <SettingRow icon={Map} label="Auto-Reroute Suggestions" desc="Suggest alternate routes to avoid hazard zones" checked={settings.autoReroute} onChange={v => update('autoReroute', v)} />
            <SettingRow icon={Radio} label="Weekly AI Reports" desc="Generate weekly prediction accuracy reports" checked={settings.weeklyReports} onChange={v => update('weeklyReports', v)} />

            <div className="mt-5 pt-4 border-t border-border space-y-4">
              <div>
                <label className={labelClass}>Prediction Window</label>
                <select className={inputClass}>
                  <option>Next 6 hours</option>
                  <option>Next 12 hours</option>
                  <option>Next 24 hours</option>
                  <option>Next 48 hours</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Risk Threshold</label>
                <input type="range" min="0" max="100" defaultValue="60" className="w-full accent-red-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                  <span>Low (Alert more)</span>
                  <span>High (Alert less)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Preferences */}
        {activeTab === 'preferences' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-0.5">User Preferences</h3>
              <p className="text-xs text-muted-foreground">Personalize your ALERT-CIA experience</p>
            </div>
            <SettingRow icon={User} label="Dark Mode" desc="Use dark theme for the dashboard (recommended)" checked={settings.darkMode} onChange={v => update('darkMode', v)} />
            <SettingRow icon={Sliders} label="Compact View" desc="Show more information with reduced spacing" checked={settings.compactView} onChange={v => update('compactView', v)} />
            <SettingRow icon={Shield} label="Auto-Logout" desc="Automatically logout after 30 minutes of inactivity" checked={settings.autoLogout} onChange={v => update('autoLogout', v)} />
            <SettingRow icon={Map} label="Show Coordinates" desc="Display GPS coordinates on map markers" checked={settings.showCoordinates} onChange={v => update('showCoordinates', v)} />
            <SettingRow icon={Volume2} label="Notification Sound" desc="Play sound for system notifications" checked={settings.notifSound} onChange={v => update('notifSound', v)} />
            <SettingRow icon={Radio} label="12-Hour Clock" desc="Display time in 12-hour format (default: 24-hour)" checked={settings.twelveHourClock} onChange={v => update('twelveHourClock', v)} />

            <div className="mt-5 pt-4 border-t border-border space-y-4">
              <div>
                <label className={labelClass}>Language</label>
                <select className={inputClass}>
                  <option>English</option>
                  <option>Filipino</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Timezone</label>
                <select className={inputClass}>
                  <option>Asia/Manila (PHT, UTC+8)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}