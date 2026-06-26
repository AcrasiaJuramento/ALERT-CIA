import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, Eye, EyeOff, CheckCircle2, ArrowLeft, User, Building, Phone, Mail, Lock, Briefcase } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { getRegistrationErrorMessage, registerOfficerAccount } from '../services/supabase';

const roles = [
  { value: 'dispatcher', label: 'Dispatch Officer', desc: 'Incident dispatch and coordination' },
  { value: 'field_responder', label: 'Field Officer', desc: 'PCR reports and field operations' },
];

const allowedPublicRoles = new Set(roles.map(role => role.value));

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', position: '', agency: '', contact: '',
    email: '', password: '', confirmPassword: '', role: 'field_responder'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allowedPublicRoles.has(form.role)) {
      setError('Public registration is only available for Dispatcher and Field Officer accounts.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before registering accounts.");
      return;
    }

    setLoading(true);
    try {
      await registerOfficerAccount(form);
      setSubmitted(true);
    } catch (requestError) {
      setError(getRegistrationErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Request Submitted
          </h2>
          <p className="text-slate-400 mb-6 leading-relaxed">
            Your account is pending administrator approval.
          </p>
          <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl text-left mb-6">
            <div className="text-xs text-slate-400 mb-2">Registration Details</div>
            <div className="text-sm text-white font-medium">{form.name}</div>
            <div className="text-xs text-slate-400">{form.email} • {roles.find(r => r.value === form.role)?.label || form.role}</div>
            <div className="text-xs text-slate-400 mt-1">{form.position} @ {form.agency}</div>
            <div className="text-xs text-slate-400 mt-1">Contact: {form.contact}</div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Siren className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ALERT-CIA</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Register Account
          </h1>
          <p className="text-slate-400 text-sm mb-8">
            Submit your registration request to gain access to the ALERT-CIA system.
          </p>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Role Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-3">User Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                      form.role === value
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={form.role === value}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="sr-only"
                    />
                    <span className="text-xs font-semibold mb-0.5">{label}</span>
                    <span className="text-[10px] opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Personal Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField icon={User} label="Full Name *" placeholder="Juan dela Cruz" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <InputField icon={Briefcase} label="Position / Rank *" placeholder="e.g. Corporal, Officer" value={form.position} onChange={v => setForm(f => ({ ...f, position: v }))} />
              <InputField icon={Building} label="Agency / Unit *" placeholder="e.g. MDRRMO Alpha Team" value={form.agency} onChange={v => setForm(f => ({ ...f, agency: v }))} />
              <InputField icon={Phone} label="Contact Number *" placeholder="09XXXXXXXXX" value={form.contact} onChange={v => setForm(f => ({ ...f, contact: v }))} />
            </div>

            <InputField icon={Mail} label="Email Address *" placeholder="yourname@mdrrmo.gov.ph" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />

            {/* Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PasswordField label="Password *" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} show={showPassword} toggle={() => setShowPassword(!showPassword)} />
              <PasswordField label="Confirm Password *" value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} show={showPassword} toggle={() => setShowPassword(!showPassword)} />
            </div>

            {/* Terms */}
            <div className="p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-2">
                <input type="checkbox" required className="mt-0.5 accent-blue-500" id="terms" />
                <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed">
                  I confirm that the information provided is accurate and I am an authorized MDRRMO personnel. I understand that misuse of the system is subject to appropriate disciplinary action.
                </label>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting Request...
                </>
              ) : (
                'Submit Registration Request'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Reusable Input component
function InputField({ icon: Icon, label, placeholder, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-2">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type={type}
          required
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
        />
      </div>
    </div>
  );
}

// Reusable Password component
function PasswordField({ label, value, onChange, show, toggle }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-2">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type={show ? 'text' : 'password'}
          required
          placeholder="Min. 8 characters"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-10 pr-10 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
