import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Siren } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { changeCurrentUserPassword } from '../services/supabase';

function getPasswordIssue(password) {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Add at least one number.';
  return '';
}

export default function ChangePasswordPage({ embedded = false }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase?.auth.getSession() || { data: null };
      if (!mounted) return;
      setHasSession(Boolean(data?.session));
      setCheckingSession(false);
    }

    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    setSaved(false);

    const passwordIssue = getPasswordIssue(password);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeCurrentUserPassword(password);
      setPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className={embedded ? 'space-y-4' : 'rounded-2xl border border-slate-800 bg-slate-900 p-8'}>
      <div>
        <h1 className={`${embedded ? 'text-lg text-foreground' : 'text-2xl text-white'} mb-1 font-bold`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Change Password
        </h1>
        <p className={embedded ? 'text-xs text-muted-foreground' : 'text-sm text-slate-400'}>
          Use a strong password that is unique to your ALERT-CIA account.
        </p>
      </div>

      {checkingSession ? (
        <div className={embedded ? 'py-8 text-sm text-muted-foreground' : 'py-8 text-center text-sm text-slate-400'}>Checking secure session...</div>
      ) : !hasSession ? (
        <div className="space-y-4">
          <div className={embedded ? 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400' : 'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400'}>
            This password link is expired or invalid. Request a new reset link.
          </div>
          {!embedded && (
            <button onClick={() => navigate('/forgot-password')} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              Request New Link
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField label="New Password" value={password} onChange={setPassword} show={showPassword} />
          <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} show={showPassword} />

          <label className={embedded ? 'flex items-center gap-2 text-xs text-muted-foreground' : 'flex items-center gap-2 text-xs text-slate-400'}>
            <input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} className="accent-blue-500" />
            Show password
          </label>

          {error && (
            <div className={embedded ? 'flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400' : 'flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400'}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {saved && (
            <div className={embedded ? 'flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400' : 'flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400'}>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Password updated.
            </div>
          )}

          <button disabled={saving} className={embedded ? 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-900' : 'w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-900'}>
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="min-h-full bg-background p-5 transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-5">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md">
        <button onClick={() => navigate('/login')} className="mb-8 flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </button>
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-600">
            <Siren className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ALERT-CIA</div>
            <div className="text-xs text-slate-400">Password Security</div>
          </div>
        </div>
        {content}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-400">{label}</span>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="Minimum 12 characters"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-10 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-blue-500"
        />
        {show ? <EyeOff className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /> : <Eye className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />}
      </div>
    </label>
  );
}
