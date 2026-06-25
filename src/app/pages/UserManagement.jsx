import { useEffect, useMemo, useState } from 'react';
import { Search, Edit2, Trash2, Shield, UserCog } from 'lucide-react';
import { deactivateProfile, listProfiles, upsertProfile } from '../services/supabase';

const roleBadge = {
  administrator: 'bg-red-500/20 text-red-400 border border-red-500/30',
  dispatcher: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  field_responder: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

const statusBadge = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-slate-500/20 text-slate-400',
  on_duty: 'bg-orange-500/20 text-orange-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
};

const statusDot = {
  active: 'bg-green-400',
  inactive: 'bg-slate-500',
  on_duty: 'bg-orange-400 animate-pulse',
  pending: 'bg-yellow-400',
};

function profileToRow(profile = {}) {
  const name = profile.display_name || profile.email || 'Unnamed user';
  return {
    id: profile.id,
    name,
    email: profile.email || '',
    contact: profile.contact_number || '',
    position: profile.position_title || '',
    agency: profile.station?.name || '',
    role: profile.roles?.[0]?.role || 'field_responder',
    status: profile.account_status || 'pending',
    avatar: name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    lastLogin: '-',
    raw: profile,
  };
}

export default function UserManagement() {
  const [userList, setUserList] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listProfiles();
      setUserList(rows.map(profileToRow));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load user profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = useMemo(() => userList.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    return matchSearch && matchRole;
  }), [filterRole, search, userList]);

  const setStatus = async (row, accountStatus) => {
    await upsertProfile({ id: row.id, account_status: accountStatus });
    await loadUsers();
  };

  const handleDelete = async id => {
    await deactivateProfile(id);
    await loadUsers();
  };

  const roleCounts = {
    all: userList.length,
    administrator: userList.filter(u => u.role === 'administrator').length,
    dispatcher: userList.filter(u => u.role === 'dispatcher').length,
    field_responder: userList.filter(u => u.role === 'field_responder').length,
  };

  return (
    <div className="p-5 space-y-5 relative bg-background min-h-full transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            User Management
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">{userList.length} registered personnel</p>
        </div>
        <button onClick={loadUsers} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all">Refresh</button>
      </div>

      {/* Role Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all', label: 'All Users', color: 'text-foreground' },
          { key: 'administrator', label: 'Administrators', color: 'text-red-400' },
          { key: 'dispatcher', label: 'Dispatchers', color: 'text-blue-400' },
          { key: 'field_responder', label: 'Field Officers', color: 'text-green-400' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setFilterRole(key)}
            className={`p-3 rounded-xl border text-left transition-all ${
              filterRole === key
                ? 'bg-blue-600/20 border-blue-500/50'
                : 'bg-secondary/50 border-border hover:border-border/80'
            }`}
          >
            <div className={`text-xl font-bold ${color}`}>{roleCounts[key]}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-card border border-border rounded-xl p-4 transition-colors duration-300">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, agency..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* User Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Personnel</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Position / Agency</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Contact</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Role</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Last Login</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/20 transition-all">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {user.avatar}
                      </div>
                      <div>
                        <div className="text-foreground font-medium">{user.name}</div>
                        <div className="text-muted-foreground text-[10px] font-mono">{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="text-foreground/80">{user.position}</div>
                    <div className="text-muted-foreground text-[10px]">{user.agency}</div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="text-muted-foreground">{user.contact}</div>
                    <div className="text-muted-foreground/70 text-[10px]">{user.email}</div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold capitalize ${roleBadge[user.role]}`}>
                      {user.role === 'field_responder' ? 'Field Officer' : user.role === 'administrator' ? 'Administrator' : 'Dispatcher Officer'}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${statusDot[user.status]}`} />
                      <span className={`text-[10px] font-medium ${statusBadge[user.status].split(' ')[1]}`}>
                        {user.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-muted-foreground text-[10px]">{user.lastLogin}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setStatus(user, user.status === 'active' ? 'inactive' : 'active')} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all" title="Toggle active status">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-lg text-purple-400 hover:bg-purple-500/10 transition-all" title="Assign Role">
                        <UserCog className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading user profiles...</div>
        )}

        {!loading && error && (
          <div className="py-12 text-center text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No users found</p>
          </div>
        )}
      </div>

    </div>
  );
}
