import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, Eye, EyeOff, AlertTriangle, Lock, Mail, ChevronRight, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    navigate('/admin');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex" style={{ fontFamily: 'Inter, sans-serif' }}>
      
      {/* Left panel */}
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
              <div className="text-xl font-bold text-white">ALERT-CIA</div>
              <div className="text-xs text-slate-400">Emergency Response System</div>
            </div>
          </div>

          <div>
            <h2 className="text-4xl font-bold text-white mb-4">
              Emergency Response<br />Command Center
            </h2>
            <p className="text-slate-400 mb-6">
              Access the real-time incident monitoring system.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
          <p className="text-slate-400 mb-6">Sign in to continue</p>

          {error && (
            <div className="bg-red-500/20 text-red-400 p-3 rounded mb-4 flex gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email"
                className="w-full pl-10 p-3 bg-slate-800 text-white rounded"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Password"
                className="w-full pl-10 pr-10 p-3 bg-slate-800 text-white rounded"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded"
            >
              {loading ? "Loading..." : "Sign In"}
            </button>

          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/register')}
              className="text-blue-400"
            >
              Request Access
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}