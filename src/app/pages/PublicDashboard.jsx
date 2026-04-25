import { Link } from "react-router-dom";
import {
  AlertTriangle, MapPin, Clock, Phone, ChevronRight,
  Droplets, Flame, Car, Activity, Shield, ExternalLink,
  Megaphone, Eye
} from "lucide-react";
import { publicAnnouncements, incidents } from "../data/mockData";

const emergencyContacts = [
  { label: "Emergency Hotline", number: "911", color: "bg-red-600" },
  { label: "MDRRMO Davao", number: "082-241-9999", color: "bg-blue-600" },
  { label: "BFP Davao", number: "082-224-0000", color: "bg-orange-600" },
  { label: "PNP Davao", number: "082-221-6843", color: "bg-slate-700" },
];

const alertColors = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "text-red-500" },
  warning: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: "text-orange-500" },
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "text-blue-500" },
};

const incidentTypeIcons = {
  "Vehicular Accident": Car,
  "Structure Fire": Flame,
  "Medical Emergency": Activity,
  "Flood Incident": Droplets,
  "Landslide": AlertTriangle,
};

export default function PublicDashboard() {
  const activeIncidents = incidents.filter(i => i.status !== "resolved");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Hero Stats */}
      <div className="bg-linear-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-black mb-1">Davao City Emergency Overview</h1>
            <p className="text-slate-400 text-sm">Real-time public safety dashboard · Updated every 30 seconds</p>
          </div>
          <Link to="/public/map" className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-xl transition-colors font-medium">
            <MapPin size={14} /> View Live Map
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Incidents", value: activeIncidents.length, icon: AlertTriangle, color: "bg-red-500/20 text-red-400" },
            { label: "Response Teams", value: "6", icon: Shield, color: "bg-blue-500/20 text-blue-400" },
            { label: "Avg Response", value: "8.4m", icon: Clock, color: "bg-orange-500/20 text-orange-400" },
            { label: "Resolved Today", value: "18", icon: Activity, color: "bg-green-500/20 text-green-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-white/5 rounded-xl p-3">
              <div className={`w-7 h-7 rounded-lg ${stat.color} flex items-center justify-center mb-2`}>
                <stat.icon size={14} />
              </div>
              <p className="text-white font-black text-xl">{stat.value}</p>
              <p className="text-slate-400 text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Emergency Announcements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Megaphone size={16} className="text-red-600" /> Emergency Announcements
          </h2>
          <span className="text-slate-400 text-xs">{publicAnnouncements.length} active</span>
        </div>
        <div className="space-y-3">
          {publicAnnouncements.map(ann => {
            const colors = alertColors[ann.level];
            return (
              <div key={ann.id} className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                    <AlertTriangle size={14} className={colors.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-bold text-sm ${colors.text}`}>{ann.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${colors.bg} ${colors.text} border ${colors.border}`}>
                        {ann.level}
                      </span>
                    </div>
                    <p className="text-slate-600 text-xs mt-1 leading-relaxed">{ann.message}</p>
                    <p className="text-slate-400 text-[10px] mt-1.5 flex items-center gap-1">
                      <Clock size={9} /> {ann.time}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Active Incidents */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Active Incidents
            </h2>
            <Link to="/public/incidents" className="text-red-600 hover:text-red-700 text-xs flex items-center gap-1">
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="space-y-3">
            {activeIncidents.slice(0, 4).map(inc => {
              const Icon = incidentTypeIcons[inc.type] || AlertTriangle;
              const colors = {
                critical: "bg-red-100 text-red-600 border-red-200",
                warning: "bg-orange-100 text-orange-600 border-orange-200",
                moderate: "bg-yellow-100 text-yellow-700 border-yellow-200",
              };
              const dotColors = {
                critical: "bg-red-500",
                warning: "bg-orange-500",
                moderate: "bg-yellow-500",
              };
              return (
                <div key={inc.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${colors[inc.severity] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      <Icon size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-slate-800 text-sm font-bold">{inc.type}</p>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[inc.severity] || ""} shrink-0`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[inc.severity] || ""} ${inc.severity === "critical" ? "animate-pulse" : ""}`} />
                          {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={10} className="text-slate-400 shrink-0" />
                        <p className="text-slate-500 text-xs">{inc.location}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-slate-400 text-[10px]">
                          <Clock size={9} /> {inc.time}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-400 text-[10px]">{inc.team}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Link
            to="/public/map"
            className="flex items-center justify-center gap-2 mt-3 py-3 bg-white border border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-600 text-slate-500 rounded-xl text-sm transition-colors"
          >
            <MapPin size={14} /> View all incidents on map <ExternalLink size={12} />
          </Link>
        </div>

        {/* Emergency Contacts */}
        <div>
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Phone size={16} className="text-blue-600" /> Emergency Contacts
          </h2>
          <div className="space-y-2.5">
            {emergencyContacts.map(contact => (
              <a
                key={contact.label}
                href={`tel:${contact.number}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md transition-all group"
              >
                <div className={`w-10 h-10 ${contact.color} rounded-xl flex items-center justify-center shrink-0`}>
                  <Phone size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-slate-700 text-xs font-semibold">{contact.label}</p>
                  <p className="text-slate-800 font-black text-base leading-tight">{contact.number}</p>
                </div>
                <ChevronRight size={14} className="ml-auto text-slate-300 group-hover:text-slate-500 transition-colors" />
              </a>
            ))}
          </div>

          {/* Safety Tips */}
          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h3 className="font-semibold text-blue-800 text-sm mb-2 flex items-center gap-2">
              <Shield size={13} /> Safety Reminders
            </h3>
            <ul className="space-y-1.5">
              {[
                "Stay calm and move to higher ground during floods",
                "Keep emergency contacts saved on your phone",
                "Avoid flooded roads and waterways",
                "Report incidents immediately to 911",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-blue-700 text-xs">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Map CTA */}
          <Link
            to="/public/map"
            className="flex items-center gap-3 mt-3 bg-linear-to-r from-slate-800 to-slate-900 rounded-xl p-4 group hover:from-slate-700 hover:to-slate-800 transition-all"
          >
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <MapPin size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold">Live Safety Map</p>
              <p className="text-slate-400 text-xs">Real-time alerts & risk zones</p>
            </div>
            <Eye size={14} className="ml-auto text-slate-400 group-hover:text-white transition-colors" />
          </Link>
        </div>
      </div>
    </div>
  );
}