import { createContext, useContext, useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, hasPermission } from '../access/rbac';

const AUTH_STORAGE_KEY = 'alert-cia-auth-user';
const AuthContext = createContext(null);

const DEMO_USERS = {
  'admin@mdrrmo.gov.ph': { name: 'Maria Santos', role: ROLES.ADMINISTRATOR },
  'dispatch@mdrrmo.gov.ph': { name: 'Juan dela Cruz', role: ROLES.DISPATCHER },
  'field@mdrrmo.gov.ph': { name: 'Roberto Aquino', role: ROLES.FIELD_OFFICER },
};

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const login = email => {
    const demoUser = DEMO_USERS[email.toLowerCase()] ?? DEMO_USERS['field@mdrrmo.gov.ph'];
    const nextUser = { id: email.toLowerCase(), email: email.toLowerCase(), ...demoUser };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    login,
    logout,
    roleLabel: user ? ROLE_LABELS[user.role] : '',
    can: permission => hasPermission(user?.role, permission),
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
