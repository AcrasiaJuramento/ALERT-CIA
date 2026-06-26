import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit2, Power, Radio, Save, Search, Shield, UserCog, X } from 'lucide-react';
import { assignProfileRole, assignProfileToRespondingTeam, deactivateProfile, getActiveTeamMembership, listProfiles, listRespondingTeams, updateProfile } from '../services/supabase';

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
  suspended: 'bg-red-400',
};

const statusLabel = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Pending',
  suspended: 'Suspended',
};

const roleOptions = [
  { value: 'dispatcher', label: 'Dispatcher Officer' },
  { value: 'field_responder', label: 'Field Officer' },
];

const editableFields = ['display_name', 'email', 'contact_number', 'position_title', 'agency'];

function profileToRow(profile = {}) {
  const name = profile.display_name || profile.email || 'Unnamed user';
  const activeTeam = getActiveTeamMembership(profile);
  return {
    id: profile.id,
    name,
    email: profile.email || '',
    contact: profile.contact_number || '',
    position: profile.position_title || '',
    agency: profile.station?.name || '',
    role: profile.roles?.[0]?.role || 'field_responder',
    teamId: activeTeam?.team_id || '',
    teamName: activeTeam?.team?.name || '',
    teamRole: activeTeam?.team_role || 'Field Officer',
    isTeamLeader: Boolean(activeTeam?.is_leader),
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
  const [savingId, setSavingId] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [roleUser, setRoleUser] = useState(null);
  const [teamUser, setTeamUser] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);
  const [formError, setFormError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listProfiles();
      setUserList(rows.map(profileToRow));
      const teams = await listRespondingTeams();
      setTeamOptions(teams);
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

  const replaceRow = profile => {
    setUserList(current => current.map(row => (row.id === profile.id ? profileToRow(profile) : row)));
  };

  const openTeamAssignment = row => {
    setFormError('');
    setTeamUser({
      id: row.id,
      name: row.name,
      teamId: row.teamId || '',
      teamRole: row.teamRole || 'Field Officer',
      isTeamLeader: row.isTeamLeader,
    });
  };

  const setStatus = async (row, accountStatus) => {
    setSavingId(row.id);
    setError('');
    try {
      const profile = await updateProfile(row.id, { account_status: accountStatus });
      replaceRow(profile);
    } catch (requestError) {
      setError(requestError.message || 'Unable to update account status.');
    } finally {
      setSavingId('');
    }
  };

  const handleApprove = row => {
    if (row.role === 'field_responder' && !row.teamId) {
      setError('Assign this field officer to a responding team before approving the account.');
      openTeamAssignment(row);
      return;
    }
    setStatus(row, 'active');
  };

  const handleSaveProfile = async event => {
    event.preventDefault();
    setFormError('');
    setSavingId(editUser.id);
    try {
      const updates = Object.fromEntries(
        editableFields.map(field => [field, editUser.raw[field]?.trim?.() ?? editUser.raw[field] ?? '']),
      );
      const profile = await updateProfile(editUser.id, updates);
      replaceRow(profile);
      setEditUser(null);
    } catch (requestError) {
      setFormError(requestError.message || 'Unable to save user details.');
    } finally {
      setSavingId('');
    }
  };

  const handleSaveRole = async event => {
    event.preventDefault();
    setFormError('');
    setSavingId(roleUser.id);
    try {
      const profile = await assignProfileRole(roleUser.id, roleUser.role);
      replaceRow(profile);
      setRoleUser(null);
    } catch (requestError) {
      setFormError(requestError.message || 'Unable to update officer role.');
    } finally {
      setSavingId('');
    }
  };

  const handleSaveTeam = async event => {
    event.preventDefault();
    setFormError('');
    setSavingId(teamUser.id);
    try {
      const profile = await assignProfileToRespondingTeam(teamUser.id, teamUser.teamId || null, {
        teamRole: teamUser.teamRole,
        isLeader: teamUser.isTeamLeader,
      });
      replaceRow(profile);
      setTeamUser(null);
    } catch (requestError) {
      setFormError(requestError.message || 'Unable to update responding team assignment.');
    } finally {
      setSavingId('');
    }
  };

  const handleDelete = async id => {
    setSavingId(id);
    setError('');
    try {
      const profile = await deactivateProfile(id);
      replaceRow(profile);
    } catch (requestError) {
      setError(requestError.message || 'Unable to deactivate user.');
    } finally {
      setSavingId('');
    }
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
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Responding Team</th>
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
                    {user.role === 'field_responder' ? (
                      <div className="space-y-2">
                        <div>
                          <div className="text-foreground/80">{user.teamName || 'No team assigned'}</div>
                          <div className="text-muted-foreground text-[10px]">{user.teamName ? user.teamRole : 'Required before approval'}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openTeamAssignment(user)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-cyan-500"
                        >
                          <Radio className="h-3.5 w-3.5" />
                          {user.teamName ? 'Change team' : 'Assign team'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-foreground/80">-</div>
                        <div className="text-muted-foreground text-[10px]">Not required</div>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${statusDot[user.status]}`} />
                      <span className={`text-[10px] font-medium ${statusBadge[user.status]?.split(' ')[1] || 'text-muted-foreground'}`}>
                        {statusLabel[user.status] || user.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-muted-foreground text-[10px]">{user.lastLogin}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      {user.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(user)}
                          disabled={savingId === user.id}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white text-[10px] font-semibold transition-all"
                          title="Approve officer account"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setFormError('');
                          setEditUser({ ...user, raw: { ...user.raw } });
                        }}
                        className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all"
                        title="Edit user details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {user.role !== 'administrator' && (
                        <button
                          onClick={() => {
                            setFormError('');
                            setRoleUser({ id: user.id, name: user.name, role: user.role });
                          }}
                          className="p-1.5 rounded-lg text-purple-400 hover:bg-purple-500/10 transition-all"
                          title="Change officer role"
                        >
                          <UserCog className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {user.role === 'field_responder' && (
                        <button
                          onClick={() => openTeamAssignment(user)}
                          className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-all"
                          title="Assign responding team"
                        >
                          <Radio className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => user.status === 'active' ? setStatus(user, 'inactive') : handleDelete(user.id)}
                        disabled={savingId === user.id}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all"
                        title={user.status === 'active' ? 'Set inactive' : 'Deactivate account'}
                      >
                        <Power className="w-3.5 h-3.5" />
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

      {editUser && (
        <Modal title="Edit User" onClose={() => setEditUser(null)}>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name" value={editUser.raw.display_name || ''} onChange={value => setEditUser(user => ({ ...user, raw: { ...user.raw, display_name: value } }))} />
              <Field label="Email" type="email" value={editUser.raw.email || ''} onChange={value => setEditUser(user => ({ ...user, raw: { ...user.raw, email: value } }))} />
              <Field label="Contact Number" value={editUser.raw.contact_number || ''} onChange={value => setEditUser(user => ({ ...user, raw: { ...user.raw, contact_number: value } }))} />
              <Field label="Position / Rank" value={editUser.raw.position_title || ''} onChange={value => setEditUser(user => ({ ...user, raw: { ...user.raw, position_title: value } }))} />
              <div className="sm:col-span-2">
                <Field label="Agency / Unit" value={editUser.raw.agency || ''} onChange={value => setEditUser(user => ({ ...user, raw: { ...user.raw, agency: value } }))} />
              </div>
            </div>
            {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditUser(null)} className="px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={savingId === editUser.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white text-xs font-semibold">
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {roleUser && (
        <Modal title="Change Officer Role" onClose={() => setRoleUser(null)}>
          <form onSubmit={handleSaveRole} className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">Selected User</div>
              <div className="text-sm font-semibold text-foreground">{roleUser.name}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roleOptions.map(option => (
                <label
                  key={option.value}
                  className={`rounded-xl border p-3 cursor-pointer transition-all ${roleUser.role === option.value ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-border bg-secondary/40 text-muted-foreground hover:border-border/80'}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={roleUser.role === option.value}
                    onChange={event => setRoleUser(user => ({ ...user, role: event.target.value }))}
                    className="sr-only"
                  />
                  <span className="text-xs font-semibold">{option.label}</span>
                </label>
              ))}
            </div>
            {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRoleUser(null)} className="px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={savingId === roleUser.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white text-xs font-semibold">
                <UserCog className="w-3.5 h-3.5" />
                Update Role
              </button>
            </div>
          </form>
        </Modal>
      )}

      {teamUser && (
        <Modal title="Assign Responding Team" onClose={() => setTeamUser(null)}>
          <form onSubmit={handleSaveTeam} className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">Selected Field Officer</div>
              <div className="text-sm font-semibold text-foreground">{teamUser.name}</div>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1.5">Responding Team</span>
              <select
                value={teamUser.teamId}
                onChange={event => setTeamUser(user => ({ ...user, teamId: event.target.value }))}
                className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500"
              >
                <option value="">No active team assignment</option>
                {teamOptions.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <Field label="Team Role" value={teamUser.teamRole} onChange={value => setTeamUser(user => ({ ...user, teamRole: value }))} />
            <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={teamUser.isTeamLeader}
                onChange={event => setTeamUser(user => ({ ...user, isTeamLeader: event.target.checked }))}
                className="accent-blue-600"
              />
              Team leader
            </label>
            {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTeamUser(null)} className="px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={savingId === teamUser.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-900 text-white text-xs font-semibold">
                <Radio className="w-3.5 h-3.5" />
                Save Assignment
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close modal">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}
