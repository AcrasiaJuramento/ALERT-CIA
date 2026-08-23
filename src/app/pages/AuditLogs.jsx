import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Eye, Filter, Search, ShieldCheck, UserRoundCheck, X } from 'lucide-react';
import { AUDIT_PAGE_SIZE, getAuditLogSummary, listAuditLogs, listProfiles } from '../services/supabase';

const initialFilters = { search: '', startDate: '', endDate: '', userId: '', role: '', module: '', action: '', platform: '', status: '' };
const roles = [['administrator', 'Administrator'], ['dispatcher', 'Dispatcher'], ['field_responder', 'Field Officer']];
const modules = ['PCR', 'DISPATCH', 'INCIDENT', 'MAP', 'USER', 'SETTINGS', 'SYSTEM'];
const actions = ['USER_LOGIN', 'USER_LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_ROLE_CHANGED', 'PCR_CREATED', 'PCR_SUBMITTED', 'PCR_ACCEPTED', 'PCR_REJECTED', 'PCR_VERIFIED', 'PCR_COMPLETED', 'PCR_DELETED', 'DISPATCH_CREATED', 'DISPATCH_ASSIGNED', 'DISPATCH_ACCEPTED', 'DISPATCH_COMPLETED', 'DISPATCH_CANCELLED', 'INCIDENT_CREATED', 'INCIDENT_UPDATED', 'INCIDENT_VERIFIED', 'INCIDENT_DELETED', 'MAP_PIN_CREATED', 'MAP_PIN_UPDATED', 'MAP_PIN_DELETED', 'SETTINGS_UPDATED'];

const readable = value => String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const dateTime = value => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : '-';
const safeJson = value => value && Object.keys(value).length ? JSON.stringify(value, null, 2) : 'No values recorded';

function SelectFilter({ label, value, onChange, options }) {
  return <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-blue-500"><option value="">All</option>{options.map(option => { const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, readable(option)]; return <option key={optionValue} value={optionValue}>{optionLabel}</option>; })}</select></label>;
}

function SummaryCard({ label, value, icon, tone }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">{createElement(icon, { className: `h-5 w-5 ${tone}` })}</div></div></div>;
}

export default function AuditLogs() {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({ total: 0, today: 0, failed: 0, activeUsers: 0 });
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [result, totals] = await Promise.all([listAuditLogs({ ...applied, page }), getAuditLogSummary()]);
      setRows(result.rows); setCount(result.count); setSummary(totals || summary);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load audit history.');
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listProfiles().then(setUsers).catch(() => setUsers([])); }, []);

  const totalPages = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
  const userOptions = useMemo(() => users.map(user => [user.id, user.display_name || user.email || user.id]), [users]);
  const applyFilters = event => { event.preventDefault(); setPage(1); setApplied(filters); };
  const clearFilters = () => { setFilters(initialFilters); setApplied(initialFilters); setPage(1); };

  return <div className="space-y-5 p-4 md:p-6">
    <div><div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-blue-400"/><h2 className="text-xl font-bold text-foreground">Audit Log History</h2></div><p className="mt-1 text-sm text-muted-foreground">Admin-only, append-only history of important ALERT-CIA activity.</p></div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <SummaryCard label="Total Activities" value={summary.total} icon={Activity} tone="text-blue-400"/>
      <SummaryCard label="Today's Activities" value={summary.today} icon={CalendarDays} tone="text-emerald-400"/>
      <SummaryCard label="Failed Actions" value={summary.failed} icon={AlertCircle} tone="text-red-400"/>
      <SummaryCard label="Active Users (24h)" value={summary.activeUsers} icon={UserRoundCheck} tone="text-violet-400"/>
    </div>

    <form onSubmit={applyFilters} className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Filter className="h-4 w-4 text-blue-400"/>Search and filters</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="space-y-1 sm:col-span-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Action, user, description, record ID" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none focus:border-blue-500"/></div></label>
        <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">From</span><input type="date" value={filters.startDate} onChange={event => setFilters(current => ({ ...current, startDate: event.target.value }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground"/></label>
        <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">To</span><input type="date" value={filters.endDate} onChange={event => setFilters(current => ({ ...current, endDate: event.target.value }))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground"/></label>
        <SelectFilter label="User" value={filters.userId} onChange={value => setFilters(current => ({ ...current, userId: value }))} options={userOptions}/>
        <SelectFilter label="Role" value={filters.role} onChange={value => setFilters(current => ({ ...current, role: value }))} options={roles}/>
        <SelectFilter label="Module" value={filters.module} onChange={value => setFilters(current => ({ ...current, module: value }))} options={modules}/>
        <SelectFilter label="Action" value={filters.action} onChange={value => setFilters(current => ({ ...current, action: value }))} options={actions}/>
        <SelectFilter label="Platform" value={filters.platform} onChange={value => setFilters(current => ({ ...current, platform: value }))} options={['Web', 'Mobile', 'Database']}/>
        <SelectFilter label="Status" value={filters.status} onChange={value => setFilters(current => ({ ...current, status: value }))} options={['success', 'failed']}/>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={clearFilters} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary">Clear</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500">Apply Filters</button></div>
    </form>

    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {loading ? <div className="p-12 text-center text-sm text-muted-foreground">Loading secure audit history...</div> : error ? <div className="p-10 text-center"><AlertCircle className="mx-auto h-7 w-7 text-red-400"/><p className="mt-2 text-sm text-red-400">{error}</p><button onClick={load} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">Retry</button></div> : !rows.length ? <div className="p-12 text-center text-sm text-muted-foreground">No audit records match the selected filters.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-3 font-semibold">Date & Time</th><th className="px-3 py-3 font-semibold">User</th><th className="px-3 py-3 font-semibold">Role</th><th className="px-3 py-3 font-semibold">Action</th><th className="px-3 py-3 font-semibold">Platform</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3"/></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/70 hover:bg-secondary/40"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateTime(row.created_at)}</td><td className="max-w-44 px-3 py-3"><div className="truncate font-semibold text-foreground">{row.actor_name || row.actor?.display_name || 'System'}</div><div className="truncate text-[10px] text-muted-foreground">{row.actor_profile_id || '-'}</div></td><td className="px-3 py-3 text-muted-foreground">{readable(row.actor_role)}</td><td className="px-3 py-3"><span className="rounded-md bg-blue-500/10 px-2 py-1 font-semibold text-blue-400">{row.action_name || String(row.action).toUpperCase()}</span></td><td className="px-3 py-3 text-muted-foreground">{row.platform || 'Database'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${row.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{readable(row.status)}</span></td><td className="px-3 py-3"><button onClick={() => setSelected(row)} title="View details" className="grid h-8 w-8 place-items-center rounded-lg text-blue-400 hover:bg-blue-500/10"><Eye className="h-4 w-4"/></button></td></tr>)}</tbody></table></div>}
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-muted-foreground">{count ? `${(page - 1) * AUDIT_PAGE_SIZE + 1}-${Math.min(page * AUDIT_PAGE_SIZE, count)} of ${count}` : '0 records'}</div><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></button><span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(current => current + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"><ChevronRight className="h-4 w-4"/></button></div></div>
    </div>

    {selected && <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/70 p-3" onMouseDown={event => event.target === event.currentTarget && setSelected(null)}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4"><div><h3 className="font-bold text-foreground">{selected.action_name || selected.action}</h3><p className="text-xs text-muted-foreground">{dateTime(selected.created_at)}</p></div><button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4"/></button></div><div className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['User', selected.actor_name || 'System'], ['Role', readable(selected.actor_role)], ['Module', selected.module], ['Record', selected.record_reference || selected.record_id || '-'], ['Platform', selected.platform], ['Status', readable(selected.status)], ['User ID', selected.actor_profile_id || '-'], ['IP address', selected.ip_address || 'Not available']].map(([label, value]) => <div key={label} className="rounded-lg bg-secondary/60 p-3"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="mt-1 break-all text-xs font-semibold text-foreground">{value}</div></div>)}</div><div><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Description</div><div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground">{selected.description || 'No description recorded.'}</div></div><div className="grid gap-4 lg:grid-cols-2"><div><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Previous value</div><pre className="max-h-80 overflow-auto rounded-lg border border-red-500/20 bg-background p-3 text-[11px] text-foreground">{safeJson(selected.previous_values)}</pre></div><div><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">New value</div><pre className="max-h-80 overflow-auto rounded-lg border border-emerald-500/20 bg-background p-3 text-[11px] text-foreground">{safeJson(selected.new_values)}</pre></div></div><p className="text-[10px] text-muted-foreground">Sensitive authentication and patient fields are redacted by the database before audit metadata is stored.</p></div></div></div>}
  </div>;
}
