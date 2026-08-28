import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, hasPermission } from '../access/rbac';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { logAuditEvent } from '../services/supabase/auditService';
import { refreshPCRReferenceCache } from '../services/pcrReferenceCache';

const AUTH_STORAGE_KEY = 'alert-cia-auth-user';
const OFFLINE_AUTH_KEY = 'alert-cia-offline-auth';
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

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  return bytesToHex(await globalThis.crypto.subtle.digest('SHA-256', encoded));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function saveOfflineLogin(user, password) {
  if (!password || !globalThis.crypto?.subtle) return;
  const salt = randomSalt();
  const passwordHash = await sha256Hex(`${salt}:${password}`);
  const offlineAuth = {
    email: user.email,
    salt,
    passwordHash,
    user,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(offlineAuth));
}

async function loginWithOfflineVerifier(email, password) {
  if (!globalThis.crypto?.subtle) return null;
  let offlineAuth = null;
  try {
    offlineAuth = JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY) || 'null');
  } catch {
    return null;
  }
  if (!offlineAuth || String(offlineAuth.email).toLowerCase() !== String(email).toLowerCase()) return null;
  const passwordHash = await sha256Hex(`${offlineAuth.salt}:${password}`);
  if (passwordHash !== offlineAuth.passwordHash) return null;
  return {
    ...offlineAuth.user,
    source: offlineAuth.user?.source || 'offline_cache',
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

function isNetworkAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed');
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
          if (!readStoredUser() && mounted) setUser(null);
          return;
        }

        const profile = await loadSupabaseProfile(sessionUser.id);
        if (profile?.account_status === 'active') {
          const nextUser = profileToUser(profile);
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
          if (mounted) setUser(nextUser);
          void refreshPCRReferenceCache().catch(error => console.warn('[offline-reference] Session cache refresh failed.', error?.message || error));
        } else {
          await supabase.auth.signOut();
          localStorage.removeItem(AUTH_STORAGE_KEY);
          if (mounted) setUser(null);
        }
      } catch {
        const storedUser = readStoredUser();
        if (storedUser && mounted) setUser(storedUser);
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
      let data;
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        data = result.data;
      } catch (error) {
        if (!isNetworkAuthError(error)) throw error;
        const offlineUser = await loginWithOfflineVerifier(email, password);
        if (!offlineUser) throw error;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(offlineUser));
        setUser(offlineUser);
        return offlineUser;
      }

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
      await saveOfflineLogin(nextUser, password);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
      void refreshPCRReferenceCache().catch(error => console.warn('[offline-reference] Login cache refresh failed.', error?.message || error));
      void logAuditEvent({ action: 'USER_LOGIN', module: 'AUTH', recordReference: nextUser.id, description: `${nextUser.name} signed in to ALERT-CIA.`, platform: 'Web', metadata: { source: 'supabase' } });
      return nextUser;
    }

    const offlineUser = await loginWithOfflineVerifier(email, password);
    if (offlineUser) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(offlineUser));
      setUser(offlineUser);
      return offlineUser;
    }

    throw new Error('Unable to sign in. Connect to the internet and try again.');
  };

  const logout = async () => {
    if (user?.id && isSupabaseConfigured) {
      await logAuditEvent({ action: 'USER_LOGOUT', module: 'AUTH', recordReference: user.id, description: `${user.name} signed out of ALERT-CIA.`, platform: 'Web' });
    }
    if (isSupabaseConfigured) await supabase.auth.signOut();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  };

  const refreshUserProfile = async () => {
    if (!isSupabaseConfigured || !user?.id) return user;
    const profile = await loadSupabaseProfile(user.id);
    const nextUser = profileToUser(profile);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const value = useMemo(() => ({
    user,
    authLoading,
    login,
    logout,
    refreshUserProfile,
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
