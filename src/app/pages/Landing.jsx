import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Map, FileText, BarChart2, Users, AlertTriangle,
  ChevronRight, Activity, Ambulance, Radio, Globe,
  ArrowRight, CheckCircle, Clock, Zap, Eye, Lock
} from "lucide-react";
import { MockMap } from "../components/MockMap";

const cityMapBg = "https://images.unsplash.com/photo-1723002093542-807b783ccf07?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxQaGlsaXBwaW5lcyUyMGNpdHklMjBhZXJpYWwlMjBtYXAlMjB2aWV3fGVufDF8fHx8MTc3MzUwNDk3MXww&ixlib=rb-4.1.0&q=80&w=1080";

const moduleList = [
  { icon: Activity, label: "Command Dashboard", desc: "Real-time statistics, live incident feed, and response team tracking in one command center view.", color: "bg-blue-600" },
  { icon: Map, label: "Map Monitoring", desc: "Full-screen live map with incident markers, accident heatmaps, flood zones, and traffic hazards.", color: "bg-indigo-600" },
  { icon: FileText, label: "Patient Care Records", desc: "Patient Care Report workflow from field creation through dispatcher review.", color: "bg-violet-600" },
  { icon: BarChart2, label: "Analytics Dashboard", desc: "Comprehensive charts and graphs for incident trends, hotspots, and response performance metrics.", color: "bg-teal-600" },
  { icon: Users, label: "User Management", desc: "Admin panel for managing field officers, dispatchers, and administrators with role-based access.", color: "bg-emerald-600" },
  { icon: Globe, label: "Public Interface", desc: "Simplified public dashboard with Waze-like map alerts for accident-prone areas and risk warnings.", color: "bg-orange-600" },
];

const steps = [
  { num: "01", title: "Incident Detected", desc: "Field officers or the public report an incident via the system. AI also predicts risk zones proactively." },
  { num: "02", title: "Dispatch & Response", desc: "Dispatch officers receive real-time alerts, assign teams, and coordinate response via the command center." },
  { num: "03", title: "Field Documentation", desc: "Responders complete Patient Care Reports (PCR) on mobile, documenting assessment, transport, and care." },
  { num: "04", title: "Resolution & Analysis", desc: "Incidents are closed and data feeds into analytics for pattern analysis and future risk prediction." },
];

const stats = [
  { label: "Incidents Today", value: "24", icon: AlertTriangle, color: "text-red-500" },
  { label: "Response Teams", value: "12", icon: Ambulance, color: "text-blue-500" },
  { label: "Avg Response Time", value: "8.4m", icon: Clock, color: "text-orange-500" },
  { label: "Resolved Today", value: "18", icon: CheckCircle, color: "text-green-500" },
];

export default function Landing() {
  const [currentStat, setCurrentStat] = useState(0);

  return (
    <div className="min-h-screen bg-[#050d1a] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-[#050d1a]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/30">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ALERT-CIA</p>
            <p className="text-slate-400 text-[10px]">Emergency Response System</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <a href="#about" className="text-slate-400 hover:text-white text-sm transition-colors">About</a>
          <a href="#modules" className="text-slate-400 hover:text-white text-sm transition-colors">Modules</a>
          <a href="#how" className="text-slate-400 hover:text-white text-sm transition-colors">How It Works</a>
          <a href="/public" className="text-slate-400 hover:text-white text-sm transition-colors">Public View</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-slate-300 hover:text-white text-sm transition-colors">Login</Link>
          <Link
            to="/login"
            className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20">
        {/* Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundImage: `url(${cityMapBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <div className="absolute inset-0 bg-linear-to-b from-[#050d1a] via-[#050d1a]/70 to-[#050d1a]" />
          <div className="absolute inset-0" style={{
            backgroundImage: "radial-gradient(rgba(30,64,175,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-20 w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-full mb-6">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-xs font-medium">MDRRMO Emergency Management Platform</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-6">
                <span className="text-white">Real-Time</span>{" "}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-red-500 to-orange-400">Emergency</span>{" "}
                <span className="text-white">Response System</span>
              </h1>

              <p className="text-slate-400 text-base md:text-lg leading-relaxed mb-8 max-w-lg">
                ALERT-CIA provides MDRRMO administrators, dispatch officers, and field responders with
                real-time situational awareness, AI-powered risk prediction, and streamlined incident
                reporting workflows.
              </p>

              {/* Live stats */}
              <div className="grid grid-cols-2 gap-3 mb-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center`}>
                      <stat.icon size={15} className={stat.color} />
                    </div>
                    <div>
                      <p className="text-white font-bold text-lg leading-none">{stat.value}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-red-600/25 hover:shadow-red-500/40"
                >
                  Get Started <ArrowRight size={16} />
                </Link>
                <Link
                  to="/public"
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium px-6 py-3 rounded-xl transition-colors border border-white/10"
                >
                  <Eye size={16} />
                  Public View
                </Link>
                <a
                  href="#about"
                  className="flex items-center gap-2 text-slate-400 hover:text-white font-medium px-4 py-3 transition-colors"
                >
                  Learn More <ChevronRight size={16} />
                </a>
              </div>
            </div>

            {/* Map preview */}
            <div className="relative">
              <div className="absolute -inset-4 bg-linear-to-r from-blue-600/20 to-red-600/20 rounded-2xl blur-xl" />
              <div className="relative h-80 md:h-96 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <MockMap showLayers={false} />
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600/90 backdrop-blur-sm rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-xs font-semibold">LIVE — Davao City</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 bg-[#070f1f] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">About the System</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Smarter Emergency Management
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-base leading-relaxed">
              ALERT-CIA integrates real-time data, spatial-temporal AI predictions, and streamlined workflows
              to empower emergency response teams across Davao City and beyond.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                color: "bg-red-500/10 border-red-500/20 text-red-400",
                title: "AI-Powered Predictions",
                desc: "Spatial-temporal AI analyzes historical incident patterns to predict accident-prone areas and high-risk time windows before incidents occur.",
              },
              {
                icon: Radio,
                color: "bg-blue-500/10 border-blue-500/20 text-blue-400",
                title: "Real-Time Coordination",
                desc: "Dispatch officers, field teams, and administrators stay connected through live incident feeds, dispatch updates, and map-based tracking.",
              },
              {
                icon: Lock,
                color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                title: "Role-Based Access",
                desc: "Secure, role-specific interfaces for Administrators, Dispatchers, Field Officers, and the public — each with tailored workflows.",
              },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-white/3 border border-white/8 hover:bg-white/5 transition-colors">
                <div className={`w-12 h-12 rounded-xl border ${item.color} flex items-center justify-center mb-4`}>
                  <item.icon size={22} />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-20 bg-[#050d1a]">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <p className="text-orange-400 text-sm font-semibold uppercase tracking-wider mb-3">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">How ALERT-CIA Works</h2>
            <p className="text-slate-400 max-w-xl mx-auto">From incident detection to resolution, every step is tracked and optimized.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <div key={step.num} className="relative">
                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-linear-to-r from-blue-500/50 to-transparent z-0" />
                )}
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 bg-linear-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
                    <span className="text-white font-black text-lg">{step.num}</span>
                  </div>
                  <h3 className="text-white font-bold text-base mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="py-20 bg-[#070f1f] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <p className="text-violet-400 text-sm font-semibold uppercase tracking-wider mb-3">System Modules</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Everything You Need</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Six integrated modules covering every aspect of emergency response management.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {moduleList.map((mod) => (
              <div
                key={mod.label}
                className="group p-5 rounded-2xl bg-white/3 border border-white/8 hover:bg-white/6 hover:border-white/15 transition-all cursor-pointer"
              >
                <div className={`w-10 h-10 ${mod.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <mod.icon size={18} className="text-white" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">{mod.label}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{mod.desc}</p>
                <div className="flex items-center gap-1 text-slate-500 group-hover:text-blue-400 mt-3 text-xs transition-colors">
                  <span>Learn more</span>
                  <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-linear-to-r from-red-600/20 to-blue-600/20 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-red-600/30">
            <Shield size={28} className="text-white" />
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
            Ready to Enhance Emergency Response?
          </h2>
          <p className="text-slate-400 text-base mb-8 max-w-xl mx-auto">
            Join MDRRMO administrators and field officers who rely on ALERT-CIA to protect communities every day.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to="/login"
              className="bg-red-600 hover:bg-red-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-red-600/25 flex items-center gap-2"
            >
              Access System <ArrowRight size={16} />
            </Link>
            <Link
              to="/register"
              className="bg-white/10 hover:bg-white/15 text-white font-medium px-8 py-3.5 rounded-xl transition-colors border border-white/15"
            >
              Register Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#050d1a] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">ALERT-CIA</p>
              <p className="text-slate-500 text-xs">Accident & Incident Reporting, Management and Monitoring System</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-slate-500 text-xs">
            <span>MDRRMO Davao City</span>
            <span>•</span>
            <span>© 2026 All Rights Reserved</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
