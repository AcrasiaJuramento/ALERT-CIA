import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Siren, Eye, EyeOff, AlertTriangle, Lock, Mail, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    login(form.email);
    navigate('/admin');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-linear-to-br from-blue-950 via-slate-900 to-red-950">
        <div className="absolute inset-0 opacity-5">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid-login" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-login)" />
          </svg>
        </div>
        <div className="relative z-10 p-12 flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
              <Siren className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ALERT-CIA</div>
              <div className="text-xs text-slate-400">Emergency Response System</div>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-full text-red-400 text-xs font-medium mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              System Online • 8 Active Incidents
            </div>
            <h2 className="text-4xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Emergency Response<br />Command Center
            </h2>
            <p className="text-slate-400 text-base leading-relaxed mb-8">
              Access the real-time incident monitoring and management system for MDRRMO Echague, Isabela field operations.
            </p>
            <div className="space-y-3">
              {[
                '🗺️ Live incident map with heatmap overlays',
                '📋 Digital PCR report workflows',
                '📊 Real-time analytics & AI predictions',
                '🚨 Instant dispatch notifications',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-slate-300 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Incidents Today', value: '12' },
              { label: 'Teams Active', value: '5' },
              { label: 'Avg Response', value: '7.2m' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 border border-white/10 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-slate-400 text-xs">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-card transition-colors duration-300">
        <div className="w-full max-w-md">
          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>

          {/* Logo (mobile only) */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <Siren className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ALERT-CIA</div>
              <div className="text-xs text-muted-foreground">Emergency Response System</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Welcome back
          </h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to access the command center</p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm mb-5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Email / Username</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="admin@mdrrmo.gov.ph"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 bg-input-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full pl-10 pr-10 py-3 bg-input-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={e => setForm(f => ({ ...f, remember: e.target.checked }))}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>
              <button type="button" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-xs">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Register link */}
          <div className="text-center">
            <span className="text-muted-foreground text-sm">Don't have an account? </span>
            <button
              onClick={() => navigate('/register')}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Request Access
            </button>
          </div>

          {/* Demo logins */}
          <div className="mt-8 p-4 bg-secondary/50 border border-border rounded-xl">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Demo Access:</div>
            <div className="space-y-1.5">
              {[
                { label: 'Administrator', email: 'admin@mdrrmo.gov.ph', pass: 'admin123' },
                { label: 'Dispatcher', email: 'dispatch@mdrrmo.gov.ph', pass: 'dispatch123' },
                { label: 'Field Officer', email: 'field@mdrrmo.gov.ph', pass: 'field123' },
              ].map(({ label, email, pass }) => (
                <button
                  key={label}
                  onClick={() => setForm({ email, password: pass, remember: false })}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-all"
                >
                  <span className="text-slate-300 text-xs font-medium">{label}</span>
                  <span className="text-slate-500 text-xs ml-2">{email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
