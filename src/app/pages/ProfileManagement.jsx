import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Building2, CheckCircle2, KeyRound, Mail, Phone, Save, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROLE_LABELS } from '../access/rbac';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/supabase';

const emptyForm = {
  displayName: '',
  email: '',
  contactNumber: '',
  positionTitle: '',
  agency: '',
};

function mapProfileToForm(profile = {}) {
  return {
    displayName: profile.display_name || '',
    email: profile.email || '',
    contactNumber: profile.contact_number || '',
    positionTitle: profile.position_title || '',
    agency: profile.agency || profile.station?.name || '',
  };
}

export default function ProfileManagement() {
  const navigate = useNavigate();
  const { user, refreshUserProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setError('');
      try {
        const nextProfile = await getCurrentUserProfile();
        if (!mounted) return;
        setProfile(nextProfile);
        setForm(mapProfileToForm(nextProfile));
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load your profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const initials = useMemo(() => {
    const source = form.displayName || user?.name || user?.email || 'User';
    return source.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }, [form.displayName, user?.email, user?.name]);

  const update = (key, value) => {
    setSaved(false);
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    setSaved(false);
    if (!form.displayName.trim()) {
      setError('Full name is required.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateCurrentUserProfile({
        displayName: form.displayName.trim(),
        contactNumber: form.contactNumber.trim(),
        positionTitle: form.positionTitle.trim(),
        agency: form.agency.trim(),
      });
      setProfile(updated);
      setForm(current => ({ ...current, ...mapProfileToForm(updated) }));
      await refreshUserProfile?.();
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-5 transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Profile Management
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Manage your account details used across ALERT-CIA.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col items-center text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-blue-600 text-2xl font-bold text-white">
                {initials}
              </div>
              <div className="mt-4 text-sm font-bold text-foreground">{form.displayName || user?.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{form.email || user?.email}</div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400">
                <Shield className="h-3.5 w-3.5" />
                {ROLE_LABELS[profile?.roles?.[0]?.role || user?.role] || user?.role}
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/change-password')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                Change Password
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading profile...</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProfileField icon={User} label="Full Name" value={form.displayName} onChange={value => update('displayName', value)} required />
                  <ProfileField icon={Mail} label="Email Address" value={form.email} disabled />
                  <ProfileField icon={Phone} label="Contact Number" value={form.contactNumber} onChange={value => update('contactNumber', value)} />
                  <ProfileField icon={Briefcase} label="Position / Rank" value={form.positionTitle} onChange={value => update('positionTitle', value)} />
                  <div className="sm:col-span-2">
                    <ProfileField icon={Building2} label="Agency / Unit" value={form.agency} onChange={value => update('agency', value)} />
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}
                {saved && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Profile updated.
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-900"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ icon: Icon, label, value, onChange, disabled = false, required = false }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          required={required}
          disabled={disabled}
          value={value}
          onChange={event => onChange?.(event.target.value)}
          className="w-full rounded-lg border border-border bg-input-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
    </label>
  );
}
