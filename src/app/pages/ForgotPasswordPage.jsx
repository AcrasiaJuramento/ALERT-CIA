import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Mail, Siren } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { sendPasswordResetEmail } from '../services/supabase';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Enter your account email address.');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Password reset is unavailable because Supabase is not configured.');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(email.trim());
      setSent(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

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
            <div className="text-xs text-slate-400">Account Recovery</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-green-500/30 bg-green-500/15">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h1 className="mb-2 text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Check Your Email
              </h1>
              <p className="mb-6 text-sm leading-relaxed text-slate-400">
                If an active account exists for that email, a secure password reset link has been sent.
              </p>
              <button onClick={() => navigate('/login')} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-700">
                Return to Login
              </button>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Forgot Password
              </h1>
              <p className="mb-6 text-sm text-slate-400">Enter your staff email to receive a secure reset link.</p>

              {error && (
                <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-slate-400">Email Address</span>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="admin@mdrrmo.gov.ph"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-blue-500"
                    />
                  </div>
                </label>

                <button disabled={loading} className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:bg-blue-900">
                  {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
