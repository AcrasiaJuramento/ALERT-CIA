import { useState } from "react";
import {
  Settings as SettingsIcon, Bell, Map, Zap, User, Shield,
  Save, ChevronRight, CheckCircle, Volume2, Mail, Phone,
  Globe, Database, Key
} from "lucide-react";

const tabs = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "map", label: "Map Display", icon: Map },
  { id: "ai", label: "AI Prediction", icon: Zap },
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "system", label: "System", icon: Database },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    // Notifications
    emailAlerts: true,
    smsAlerts: true,
    pushAlerts: true,
    criticalOnly: false,
    alertSound: true,
    incidentCreated: true,
    teamDispatched: true,
    incidentResolved: true,
    aiPredictions: true,

    // Map
    defaultView: "dark",
    showHeatmap: true,
    showDangerZones: true,
    showRoads: true,
    showLabels: true,
    mapRefreshRate: "30",
    defaultZoom: "13",

    // AI
    aiEnabled: true,
    predictionRadius: "500",
    confidenceThreshold: "60",
    historicalDepth: "90",
    autoAlert: true,
    aiAlertLevel: "60",

    // Account
    displayName: "Maria Santos",
    email: "msantos@mdrrmo.gov.ph",
    phone: "09171234567",
    timezone: "Asia/Manila",
    language: "en",

    // Security
    twoFactor: true,
    sessionTimeout: "60",
    loginAlerts: true,
  });

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));
  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = async () => {
    await new Promise(r => setTimeout(r, 800));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-slate-800 font-bold text-lg flex items-center gap-2">
          <SettingsIcon size={18} className="text-slate-600" /> System Settings
        </h2>
        <p className="text-slate-500 text-xs mt-0.5">Configure ALERT-CIA system preferences and integrations</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Sidebar Tabs */}
        <div className="md:w-52 shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors border-b border-slate-50 last:border-b-0
                  ${activeTab === tab.id
                    ? "bg-blue-50 text-blue-700 border-l-2 border-l-blue-600"
                    : "text-slate-600 hover:bg-slate-50"
                  }`}
              >
                <tab.icon size={15} />
                {tab.label}
                <ChevronRight size={12} className="ml-auto text-slate-300" />
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {/* Notifications */}
          {activeTab === "notifications" && (
            <SettingsSection title="Notification Settings" icon={<Bell size={14} className="text-blue-600" />}>
              <SettingsGroup label="Alert Channels">
                <ToggleRow label="Email Alerts" desc="Receive incident alerts via email" value={settings.emailAlerts} onToggle={() => toggle("emailAlerts")} icon={<Mail size={13} />} />
                <ToggleRow label="SMS Alerts" desc="Receive incident alerts via SMS" value={settings.smsAlerts} onToggle={() => toggle("smsAlerts")} icon={<Phone size={13} />} />
                <ToggleRow label="Push Notifications" desc="Browser and mobile push notifications" value={settings.pushAlerts} onToggle={() => toggle("pushAlerts")} icon={<Bell size={13} />} />
                <ToggleRow label="Alert Sound" desc="Play audio alert for critical incidents" value={settings.alertSound} onToggle={() => toggle("alertSound")} icon={<Volume2 size={13} />} />
              </SettingsGroup>

              <SettingsGroup label="Alert Events">
                <ToggleRow label="New Incident Created" desc="Alert when a new incident is logged" value={settings.incidentCreated} onToggle={() => toggle("incidentCreated")} />
                <ToggleRow label="Team Dispatched" desc="Alert when response team is dispatched" value={settings.teamDispatched} onToggle={() => toggle("teamDispatched")} />
                <ToggleRow label="Incident Resolved" desc="Alert when an incident is resolved" value={settings.incidentResolved} onToggle={() => toggle("incidentResolved")} />
                <ToggleRow label="AI Prediction Alerts" desc="Alert for high-risk zone predictions" value={settings.aiPredictions} onToggle={() => toggle("aiPredictions")} />
                <ToggleRow label="Critical Incidents Only" desc="Limit alerts to critical severity only" value={settings.criticalOnly} onToggle={() => toggle("criticalOnly")} />
              </SettingsGroup>
            </SettingsSection>
          )}

          {/* Map Display */}
          {activeTab === "map" && (
            <SettingsSection title="Map Display Configuration" icon={<Map size={14} className="text-indigo-600" />}>
              <SettingsGroup label="Map Style">
                <div className="grid grid-cols-3 gap-3">
                  {["dark", "satellite", "light"].map(style => (
                    <button
                      key={style}
                      onClick={() => update("defaultView", style)}
                      className={`p-3 rounded-xl border-2 text-center transition-all capitalize text-sm font-medium
                        ${settings.defaultView === style
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                    >
                      {style === "dark" ? "🌑" : style === "satellite" ? "🛰️" : "☀️"} {style}
                    </button>
                  ))}
                </div>
              </SettingsGroup>

              <SettingsGroup label="Map Layers">
                <ToggleRow label="Show Accident Heatmap" desc="Display heat intensity overlay" value={settings.showHeatmap} onToggle={() => toggle("showHeatmap")} />
                <ToggleRow label="Show Danger Zones" desc="Display hazard zone boundaries" value={settings.showDangerZones} onToggle={() => toggle("showDangerZones")} />
                <ToggleRow label="Show Road Network" desc="Display road paths on map" value={settings.showRoads} onToggle={() => toggle("showRoads")} />
                <ToggleRow label="Show Location Labels" desc="Display barangay/area labels" value={settings.showLabels} onToggle={() => toggle("showLabels")} />
              </SettingsGroup>

              <SettingsGroup label="Map Performance">
                <SelectRow label="Auto-Refresh Rate" desc="How often the map refreshes live data" value={settings.mapRefreshRate} onChange={v => update("mapRefreshRate", v)}
                  options={[{ label: "15 seconds", value: "15" }, { label: "30 seconds", value: "30" }, { label: "1 minute", value: "60" }, { label: "5 minutes", value: "300" }]} />
                <SelectRow label="Default Zoom Level" desc="Initial map zoom when opened" value={settings.defaultZoom} onChange={v => update("defaultZoom", v)}
                  options={[{ label: "City Level (12)", value: "12" }, { label: "District Level (13)", value: "13" }, { label: "Barangay Level (14)", value: "14" }, { label: "Street Level (15)", value: "15" }]} />
              </SettingsGroup>
            </SettingsSection>
          )}

          {/* AI Prediction */}
          {activeTab === "ai" && (
            <SettingsSection title="AI Prediction Settings" icon={<Zap size={14} className="text-violet-600" />}>
              <SettingsGroup label="AI System">
                <ToggleRow label="Enable AI Predictions" desc="Turn on spatial-temporal accident prediction" value={settings.aiEnabled} onToggle={() => toggle("aiEnabled")} />
                <ToggleRow label="Auto-Alert on High Risk" desc="Automatically send alerts for high-risk zones" value={settings.autoAlert} onToggle={() => toggle("autoAlert")} />
              </SettingsGroup>

              <SettingsGroup label="Prediction Parameters">
                <SelectRow label="Prediction Radius" desc="Radius of risk zone detection (meters)" value={settings.predictionRadius} onChange={v => update("predictionRadius", v)}
                  options={[{ label: "250m", value: "250" }, { label: "500m", value: "500" }, { label: "1km", value: "1000" }, { label: "2km", value: "2000" }]} />
                <SelectRow label="Confidence Threshold" desc="Minimum confidence to trigger alert (%)" value={settings.confidenceThreshold} onChange={v => update("confidenceThreshold", v)}
                  options={[{ label: "50%", value: "50" }, { label: "60%", value: "60" }, { label: "70%", value: "70" }, { label: "80%", value: "80" }]} />
                <SelectRow label="Historical Data Depth" desc="Days of historical data used for prediction" value={settings.historicalDepth} onChange={v => update("historicalDepth", v)}
                  options={[{ label: "30 days", value: "30" }, { label: "60 days", value: "60" }, { label: "90 days", value: "90" }, { label: "180 days", value: "180" }]} />
              </SettingsGroup>

              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Zap size={14} className="text-violet-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-violet-800 text-sm font-semibold">AI Model Status</p>
                    <p className="text-violet-600 text-xs mt-1">
                      Current model: <strong>ALERT-CIA v2.1</strong> · Last trained: March 10, 2026 · Accuracy: <strong>84.3%</strong>
                    </p>
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {/* Account */}
          {activeTab === "account" && (
            <SettingsSection title="Account Preferences" icon={<User size={14} className="text-teal-600" />}>
              <SettingsGroup label="Personal Information">
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    { key: "displayName", label: "Display Name", type: "text" },
                    { key: "email", label: "Email Address", type: "email" },
                    { key: "phone", label: "Contact Number", type: "tel" },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-slate-600 text-xs font-medium mb-1.5">{label}</label>
                      <input type={type} value={settings[key]} onChange={e => update(key, e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-slate-600 text-xs font-medium mb-1.5">Language</label>
                    <select value={settings.language} onChange={e => update("language", e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all">
                      <option value="en">English</option>
                      <option value="fil">Filipino</option>
                    </select>
                  </div>
                </div>
              </SettingsGroup>
            </SettingsSection>
          )}

          {/* Security */}
          {activeTab === "security" && (
            <SettingsSection title="Security Settings" icon={<Shield size={14} className="text-red-500" />}>
              <SettingsGroup label="Authentication">
                <ToggleRow label="Two-Factor Authentication" desc="Require 2FA for account login" value={settings.twoFactor} onToggle={() => toggle("twoFactor")} />
                <ToggleRow label="Login Alerts" desc="Email notification on new login" value={settings.loginAlerts} onToggle={() => toggle("loginAlerts")} />
              </SettingsGroup>
              <SettingsGroup label="Session">
                <SelectRow label="Session Timeout" desc="Auto-logout after inactivity" value={settings.sessionTimeout} onChange={v => update("sessionTimeout", v)}
                  options={[{ label: "15 minutes", value: "15" }, { label: "30 minutes", value: "30" }, { label: "1 hour", value: "60" }, { label: "4 hours", value: "240" }]} />
              </SettingsGroup>
              <SettingsGroup label="Actions">
                <div className="flex flex-wrap gap-3">
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
                    <Key size={14} /> Change Password
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                    <Shield size={14} /> Revoke All Sessions
                  </button>
                </div>
              </SettingsGroup>
            </SettingsSection>
          )}

          {/* System */}
          {activeTab === "system" && (
            <SettingsSection title="System Configuration" icon={<Database size={14} className="text-slate-600" />}>
              <SettingsGroup label="System Information">
                {[
                  { label: "Version", value: "ALERT-CIA v2.1.0" },
                  { label: "Environment", value: "Production" },
                  { label: "Server Region", value: "Davao City, PH" },
                  { label: "Database", value: "PostgreSQL 15.2" },
                  { label: "Last Backup", value: "March 14, 2026 · 02:00 AM" },
                  { label: "API Status", value: "Operational" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-slate-500 text-sm">{item.label}</span>
                    <span className="text-slate-700 text-sm font-medium">{item.value}</span>
                  </div>
                ))}
              </SettingsGroup>
            </SettingsSection>
          )}

          {/* Save Button */}
          <div className="flex items-center justify-between gap-3">
            {saved && (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle size={15} /> Settings saved successfully
              </div>
            )}
            <button
              onClick={handleSave}
              className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Save size={14} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        {icon}
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function SettingsGroup({ label, children }) {
  return (
    <div>
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ToggleRow({ label, desc, value, onToggle, icon }) {
  return (
    <div className="flex items-center justify-between py-2 gap-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-slate-400">{icon}</span>}
        <div>
          <p className="text-slate-700 text-sm font-medium">{label}</p>
          <p className="text-slate-400 text-xs">{desc}</p>
        </div>
      </div>
      <button onClick={onToggle} className="shrink-0 relative inline-flex items-center">
        <div className={`w-10 h-5.5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-200"}`} style={{ height: "22px" }} />
        <div className={`absolute w-4 h-4 bg-white rounded-full shadow transition-transform`} style={{ transform: value ? "translateX(20px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

function SelectRow({ label, desc, value, onChange, options }) {
  return (
    <div className="flex items-center justify-between py-2 gap-4">
      <div>
        <p className="text-slate-700 text-sm font-medium">{label}</p>
        <p className="text-slate-400 text-xs">{desc}</p>
      </div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-blue-400">
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}
