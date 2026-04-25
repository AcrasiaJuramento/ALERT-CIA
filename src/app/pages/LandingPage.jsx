import { useNavigate } from 'react-router';
import {
  Siren, Shield, Map, FileText, BarChart2, Users, AlertTriangle,
  ChevronRight, Zap, Globe, Clock, Radio, ArrowRight, CheckCircle2,
  Activity, PhoneCall
} from 'lucide-react';
import { MapSimulation } from '../components/MapSimulation';

const HERO_IMG = 'https://images.unsplash.com/photo-1692133211836-52846376d66f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbWVyZ2VuY3klMjBjb21tYW5kJTIwY2VudGVyJTIwb3BlcmF0aW9ucyUyMHJvb20lMjBzY3JlZW5zfGVufDF8fHx8MTc3MzUwNjEzOHww&ixlib=rb-4.1.0&q=80&w=1080';
const RESPONDER_IMG = 'https://images.unsplash.com/photo-1607264469190-4abbbd14f5ab?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXNjdWUlMjB0ZWFtJTIwcGFyYW1lZGljcyUyMGVtZXJnZW5jeSUyMHJlc3BvbnNlfGVufDF8fHx8MTc3MzUwNjEzOHww&ixlib=rb-4.1.0&q=80&w=1080';
const VEHICLES_IMG = 'https://images.unsplash.com/photo-1689471335701-904874c90bbf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbWJ1bGFuY2UlMjBmaXJlJTIwdHJ1Y2slMjBlbWVyZ2VuY3klMjB2ZWhpY2xlcyUyMHJlc3BvbnNlfGVufDF8fHx8MTc3MzUwNjE0Mnww&ixlib=rb-4.1.0&q=80&w=1080';

const modules = [
  { icon: LayoutDashboardIcon, label: 'Command Dashboard', desc: 'Real-time situational awareness with live incident maps, KPIs, and dispatch updates.', color: 'blue' },
  { icon: AlertTriangle, label: 'Incident Management', desc: 'Track, manage, and resolve all incidents with detailed reporting and assignment tools.', color: 'red' },
  { icon: Map, label: 'Map Monitoring', desc: 'Full-screen map with heatmaps, danger zones, accident hotspots, and real-time markers.', color: 'teal' },
  { icon: FileText, label: 'PCR Reports', desc: 'Digital Patient Care Reports with multi-step workflows from response to hospital transport.', color: 'purple' },
  { icon: BarChart2, label: 'Analytics', desc: 'Performance dashboards, trend analysis, and spatial-temporal AI predictions.', color: 'amber' },
  { icon: Globe, label: 'Public Interface', desc: 'Waze-style public map with accident-prone area alerts and real-time safety notifications.', color: 'green' },
];

function LayoutDashboardIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

const steps = [
  { num: '01', title: 'Incident Reported', desc: 'Incident is reported by field officers, dispatch, or the public through the platform.' },
  { num: '02', title: 'Dispatch Notified', desc: 'Emergency dispatch receives real-time alert and activates the nearest response team.' },
  { num: '03', title: 'Team Responds', desc: 'Field responders are dispatched and update status in real-time on the mobile app.' },
  { num: '04', title: 'PCR Submitted', desc: 'Patient Care Reports are completed digitally and submitted for admin verification.' },
  { num: '05', title: 'Incident Resolved', desc: 'Incident is marked resolved, data is analyzed, and reports are archived.' },
];

const colorMap = {
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/30',
  teal: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  green: 'bg-green-500/10 text-green-400 border-green-500/30',
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-white transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <Siren className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ALERT-CIA</span>
              <div className="text-[9px] text-slate-400 leading-none">Emergency Response System</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button onClick={() => navigate('/public')} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Public View</button>
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all"
            >
              Staff Login
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-16">
        {/* Background Image */}
        <div className="absolute inset-0 overflow-hidden">
          <img src={HERO_IMG} alt="Command Center" className="w-full h-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-linear-to-r from-slate-950 via-slate-950/80 to-slate-950/40" />
        </div>

        {/* Animated Grid */}
        <div className="absolute inset-0 opacity-5">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-full text-red-400 text-xs font-medium mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              MDRRMO Emergency Response Platform
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold mb-4 leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              ALERT
              <span className="text-red-500">-</span>
              CIA
            </h1>
            <div className="text-xl md:text-2xl text-slate-300 font-medium mb-3">
              Accident & Incident Reporting, Management, and Monitoring System
            </div>
            <p className="text-slate-400 text-base md:text-lg mb-8 leading-relaxed max-w-2xl">
              A comprehensive real-time emergency response platform for MDRRMO administrators, dispatch officers, field responders, and the public—powered by spatial-temporal AI prediction.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/25 text-base"
              >
                <Zap className="w-5 h-5" />
                Get Started
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate('/public')}
                className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all border border-slate-700 text-base"
              >
                <Globe className="w-5 h-5" />
                Public Safety View
              </button>
              <button
                onClick={() => navigate('/public/map')}
                className="flex items-center gap-2 px-6 py-4 text-slate-300 hover:text-white font-medium transition-colors text-base"
              >
                <Map className="w-5 h-5" />
                View Live Map
              </button>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-6 mt-10">
              {[
                { icon: Activity, value: '24/7', label: 'Monitoring' },
                { icon: Clock, value: '<8min', label: 'Avg Response' },
                { icon: Radio, value: '5 Teams', label: 'Active Now' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-bold">{value}</span>
                  <span className="text-slate-500 text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500">
          <span className="text-xs">Scroll to explore</span>
          <div className="w-5 h-8 border border-slate-600 rounded-full flex items-start justify-center pt-1.5">
            <div className="w-1 h-2 bg-slate-400 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* Map Preview Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Live Emergency Map
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Real-time incident monitoring with heatmap overlays, danger zones, and active incident markers across the monitoring zone.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" style={{ height: '450px' }}>
            <MapSimulation height="450px" showControls={false} />
          </div>
          <div className="flex flex-wrap justify-center gap-6 mt-6">
            {[
              { color: 'bg-red-500', label: 'Critical Incident' },
              { color: 'bg-orange-500', label: 'Warning' },
              { color: 'bg-yellow-500', label: 'Moderate Risk' },
              { color: 'bg-green-500', label: 'Resolved' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-slate-400 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Modules */}
      <section className="py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-2">System Modules</div>
            <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Everything for Emergency Response
            </h2>
            <p className="text-slate-400 mt-3 max-w-2xl mx-auto">
              A complete suite of tools designed for every stage of emergency response management.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map(({ icon: Icon, label, desc, color }) => (
              <div
                key={label}
                className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-600 transition-all group cursor-pointer"
              >
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${colorMap[color]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold mb-2 group-hover:text-white">{label}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-2">Workflow</div>
            <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              How ALERT-CIA Works
            </h2>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700 hidden md:block" />
            <div className="space-y-8">
              {steps.map((step, i) => (
                <div
                  key={step.num}
                  className={`flex gap-8 items-center ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                >
                  <div className={`flex-1 ${i % 2 === 0 ? 'md:text-right' : 'md:text-left'}`}>
                    <div className={`inline-block p-5 bg-slate-800 border border-slate-700 rounded-xl hover:border-blue-500/50 transition-all`}>
                      <div className="text-blue-400 text-xs font-mono font-bold mb-1">{step.num}</div>
                      <h3 className="text-base font-semibold mb-1">{step.title}</h3>
                      <p className="text-slate-400 text-sm">{step.desc}</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0 border-2 border-slate-900 relative z-10 text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 hidden md:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Target Users */}
      <section className="py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-3">Built For</div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Every Role in Emergency Response
              </h2>
              <p className="text-slate-400 mb-6 leading-relaxed">
                ALERT-CIA is designed for the complete emergency response ecosystem—from command center administrators to field responders and the public.
              </p>
              {[
                { role: 'MDRRMO Administrators', desc: 'Full system access, analytics, user management, and command oversight' },
                { role: 'Dispatch Officers', desc: 'Real-time incident management, team assignment, and communication' },
                { role: 'Field Responders', desc: 'Mobile PCR reports, incident updates, and location tracking' },
                { role: 'Public Citizens', desc: 'Safety alerts, incident monitoring, and Waze-style hazard notifications' },
              ].map(({ role, desc }) => (
                <div key={role} className="flex items-start gap-3 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-white">{role}</div>
                    <div className="text-xs text-slate-400">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative">
              <img src={RESPONDER_IMG} alt="Emergency Responders" className="rounded-2xl w-full object-cover h-80 opacity-80" />
              <div className="absolute inset-0 bg-linear-to-t from-slate-950/60 to-transparent rounded-2xl" />
              <img src={VEHICLES_IMG} alt="Emergency Vehicles" className="rounded-2xl w-2/3 object-cover h-40 absolute -bottom-6 -right-6 border-2 border-slate-800 shadow-xl opacity-80" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-linear-to-br from-red-950/50 via-slate-900 to-blue-950/50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-5" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Ready to Strengthen Emergency Response?
          </h2>
          <p className="text-slate-400 mb-8 text-lg">
            Join MDRRMO's digital transformation. Monitor, manage, and respond to emergencies faster with AI-powered intelligence.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-lg"
            >
              Access System
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl border border-slate-700 transition-all"
            >
              Register Account
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 mt-8 text-slate-500">
            <PhoneCall className="w-4 h-4 text-red-400" />
            <span className="text-sm">Emergency Hotline: <strong className="text-red-400">911</strong></span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-red-600 rounded flex items-center justify-center">
              <Siren className="w-4 h-4 text-white" />
            </div>
            <span className="text-slate-400 text-sm">ALERT-CIA © 2024 MDRRMO. All rights reserved.</span>
          </div>
          <div className="flex gap-6 text-slate-500 text-xs">
            <span>Powered by Spatial-Temporal AI</span>
            <span>•</span>
            <span>MDRRMO Echague, Isabela</span>
          </div>
        </div>
      </footer>
    </div>
  );
}