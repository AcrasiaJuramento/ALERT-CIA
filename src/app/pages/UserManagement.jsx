import { useState } from 'react';
import { Search, Plus, Edit2, Trash2, Shield, X, Check, UserCog } from 'lucide-react';
import { users } from '../data/mockData';

const roleBadge = {
  admin: 'bg-red-500/20 text-red-400 border border-red-500/30',
  dispatcher: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  field_officer: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

const statusBadge = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-slate-500/20 text-slate-400',
  on_duty: 'bg-orange-500/20 text-orange-400',
};

const statusDot = {
  active: 'bg-green-400',
  inactive: 'bg-slate-500',
  on_duty: 'bg-orange-400 animate-pulse',
};

const inputClass = 'w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all';
const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';

export default function UserManagement() {
  const [userList, setUserList] = useState(users);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '', position: '', agency: '', contact: '', email: '',
    role: 'field_officer', status: 'active',
  });

  const filtered = userList.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const handleAddUser = () => {
    const user = {
      id: `USR-00${userList.length + 1}`,
      ...newUser,
      avatar: newUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      lastLogin: 'Never',
    };
    setUserList([user, ...userList]);
    setShowModal(false);
    setNewUser({ name: '', position: '', agency: '', contact: '', email: '', role: 'field_officer', status: 'active' });
  };

  const handleDelete = id => {
    setUserList(prev => prev.filter(u => u.id !== id));
  };

  const roleCounts = {
    all: userList.length,
    admin: userList.filter(u => u.role === 'admin').length,
    dispatcher: userList.filter(u => u.role === 'dispatcher').length,
    field_officer: userList.filter(u => u.role === 'field_officer').length,
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
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add User
        </button>
      </div>

      {/* Role Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all', label: 'All Users', color: 'text-foreground' },
          { key: 'admin', label: 'Administrators', color: 'text-red-400' },
          { key: 'dispatcher', label: 'Dispatchers', color: 'text-blue-400' },
          { key: 'field_officer', label: 'Field Officers', color: 'text-green-400' },
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
                      {user.role === 'field_officer' ? 'Field Officer' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
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
                      <button className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all" title="Edit">
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

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No users found</p>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl transition-colors duration-300">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Add New User
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Role */}
              <div>
                <label className={labelClass}>User Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'admin', label: 'Admin' },
                    { value: 'dispatcher', label: 'Dispatcher' },
                    { value: 'field_officer', label: 'Field Officer' },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      className={`flex items-center justify-center py-2.5 rounded-xl border cursor-pointer transition-all text-xs font-medium ${
                        newUser.role === value
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                          : 'bg-secondary/50 border-border text-muted-foreground hover:border-blue-500/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="newRole"
                        value={value}
                        checked={newUser.role === value}
                        onChange={e => setNewUser(u => ({ ...u, role: e.target.value}))}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Full name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Position *</label>
                  <input value={newUser.position} onChange={e => setNewUser(u => ({ ...u, position: e.target.value }))} placeholder="Position/rank" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Agency / Team</label>
                  <input value={newUser.agency} onChange={e => setNewUser(u => ({ ...u, agency: e.target.value }))} placeholder="Agency or team" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact</label>
                  <input value={newUser.contact} onChange={e => setNewUser(u => ({ ...u, contact: e.target.value }))} placeholder="09XXXXXXXXX" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Email *</label>
                  <input value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="email@mdrrmo.gov.ph" className={inputClass} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  Add User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}