import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, hasPermission } from '../access/rbac';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AUTH_STORAGE_KEY = 'alert-cia-auth-user';
const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function profileToUser(profile) {
  const role = profile?.roles?.[0]?.role || ROLES.FIELD_OFFICER;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.display_name,
    role,
    status: profile.account_status,
  };
}

async function loadSupabaseProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, roles:profile_roles!profile_roles_profile_id_fkey(role)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [authLoading, setAuthLoading] = useState(Boolean(isSupabaseConfigured));

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;

    async function restoreSession() {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (!sessionUser) {
          if (mounted) setUser(null);
          return;
        }

        const profile = await loadSupabaseProfile(sessionUser.id);
        if (profile?.account_status === 'active') {
          const nextUser = profileToUser(profile);
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
          if (mounted) setUser(nextUser);
        } else {
          await supabase.auth.signOut();
          localStorage.removeItem(AUTH_STORAGE_KEY);
          if (mounted) setUser(null);
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    restoreSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const profile = await loadSupabaseProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('No officer profile is connected to this account.');
      }
      if (profile.account_status !== 'active') {
        await supabase.auth.signOut();
        if (profile.account_status === 'pending') {
          throw new Error('Your account is pending administrator approval.');
        }
        throw new Error('Your account is not active. Contact an administrator for assistance.');
      }

      const nextUser = profileToUser(profile);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
      return nextUser;
    }

    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before signing in.');
  };

  const logout = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    authLoading,
    login,
    logout,
    roleLabel: user ? ROLE_LABELS[user.role] : '',
    can: permission => hasPermission(user?.role, permission),
  }), [user, authLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
