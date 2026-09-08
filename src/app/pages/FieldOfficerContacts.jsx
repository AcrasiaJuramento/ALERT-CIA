import { useEffect, useMemo, useState } from 'react';
import { Phone, Search, ShieldCheck, Users } from 'lucide-react';
import { listFieldOfficerContacts } from '../services/supabase';

function callableNumber(value) {
  const number = String(value || '').trim();
  if (!number) return '';
  const prefix = number.startsWith('+') ? '+' : '';
  return `${prefix}${number.replace(/\D/g, '')}`;
}

export default function FieldOfficerContacts() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    listFieldOfficerContacts()
      .then(rows => mounted && setContacts(rows || []))
      .catch(requestError => mounted && setError(requestError.message || 'Unable to load Field Officer contacts.'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter(contact => [contact.display_name, contact.contact_number, contact.team_name, contact.position_title]
      .some(value => String(value || '').toLowerCase().includes(query)));
  }, [contacts, search]);

  return (
    <div className="min-h-full bg-background p-5">
      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-500"><Phone className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-foreground">Field Officer Contacts</h1><p className="mt-1 text-sm text-muted-foreground">Call an active Field Officer using the contact number saved in their profile.</p></div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" />Dispatcher access</div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search officer, team, position, or number" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{filtered.length} officers</span>
      </div>

      {loading && <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading Field Officer contacts…</div>}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}
      {!loading && !error && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(contact => {
          const number = callableNumber(contact.contact_number);
          const initials = String(contact.display_name || 'FO').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
          return <article key={contact.id} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{initials}</div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-foreground">{contact.display_name || 'Unnamed Field Officer'}</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{contact.position_title || 'Field Officer'}</p><p className="mt-1 truncate text-[11px] font-medium text-blue-500">{contact.team_name || 'No responding team assigned'}</p></div></div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5"><div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contact number</div><div className="mt-0.5 font-mono text-sm font-semibold text-foreground">{contact.contact_number || 'Not provided'}</div></div>{number ? <a href={`tel:${number}`} aria-label={`Call ${contact.display_name}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500"><Phone className="h-4 w-4" />Call</a> : <button disabled className="h-10 rounded-lg bg-secondary px-4 text-xs font-semibold text-muted-foreground opacity-60">No number</button>}</div>
          </article>;
        })}
        {!filtered.length && <div className="col-span-full flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-5 py-14 text-center"><Users className="mb-3 h-8 w-8 text-muted-foreground/50"/><div className="text-sm font-semibold text-foreground">No Field Officers found</div><div className="mt-1 text-xs text-muted-foreground">Try a different search or add contact numbers in User Management.</div></div>}
      </div>}
    </div>
  );
}
