import { useMemo, useState } from 'react';
import {
  AlertTriangle, BellRing, CheckCircle2, Droplets, Edit3, Megaphone,
  MapPin, Plus, Save, TrafficCone, Trash2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { deleteAdvisory, formatAdvisoryTime, loadAdvisories, saveAdvisory } from '../utils/advisoryStorage';

const emptyForm = {
  id: '',
  title: '',
  message: '',
  severity: 'warning',
  category: 'flood',
  area: 'Echague, Isabela',
  coordinates: null,
  status: 'published',
};

const severityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'resolved', label: 'Resolved' },
];

const categoryOptions = [
  { value: 'flood', label: 'Flood', icon: Droplets },
  { value: 'road_closure', label: 'Road Closure', icon: TrafficCone },
  { value: 'weather', label: 'Weather', icon: BellRing },
  { value: 'general', label: 'General', icon: Megaphone },
];

const severityStyles = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-400',
  warning: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  moderate: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  resolved: 'border-green-500/30 bg-green-500/10 text-green-400',
};

const categoryLabel = (value) => categoryOptions.find((item) => item.value === value)?.label || 'General';

export default function AdvisoryModule() {
  const [advisories, setAdvisories] = useState(() => loadAdvisories());
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('all');

  const filteredAdvisories = useMemo(() => (
    filter === 'all' ? advisories : advisories.filter((item) => item.status === filter)
  ), [advisories, filter]);

  const publishedCount = advisories.filter((item) => item.status === 'published').length;
  const draftCount = advisories.filter((item) => item.status === 'draft').length;

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const resetForm = () => setForm(emptyForm);
  const previewMarker = form.coordinates ? [{
    ...form,
    id: form.id || 'advisory-draft-pin',
    title: form.title || 'New advisory pin',
    message: form.message || 'Pinned advisory location',
    coordinates: form.coordinates,
  }] : [];

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('Please add a title and advisory message.');
      return;
    }

    const saved = saveAdvisory({
      ...form,
      title: form.title.trim(),
      message: form.message.trim(),
      area: form.area.trim() || 'Echague, Isabela',
    });
    setAdvisories(loadAdvisories());
    setForm(emptyForm);
    toast.success(saved.status === 'published' ? 'Advisory published to the public page.' : 'Advisory saved as draft.');
  };

  const toggleStatus = (advisory) => {
    const nextStatus = advisory.status === 'published' ? 'draft' : 'published';
    saveAdvisory({ ...advisory, status: nextStatus });
    setAdvisories(loadAdvisories());
    toast.success(nextStatus === 'published' ? 'Advisory is now visible publicly.' : 'Advisory moved to draft.');
  };

  const removeAdvisory = (id) => {
    deleteAdvisory(id);
    setAdvisories(loadAdvisories());
    if (form.id === id) resetForm();
    toast.success('Advisory removed.');
  };

  return (
    <div className="min-h-full bg-(--emergency-bg) p-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Public Advisory Module
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Create flood alerts, road closure notices, and public safety advisories.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2">
            <div className="text-[10px] uppercase text-green-400">Published</div>
            <div className="text-lg font-bold text-green-400">{publishedCount}</div>
          </div>
          <div className="rounded-lg border border-slate-500/20 bg-slate-500/10 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Drafts</div>
            <div className="text-lg font-bold text-foreground">{draftCount}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{form.id ? 'Edit Advisory' : 'New Advisory'}</h2>
              <p className="text-xs text-muted-foreground">Published advisories appear on the public dashboard.</p>
            </div>
            {form.id && (
              <button type="button" onClick={resetForm} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" title="Clear form">
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Title</span>
              <input
                value={form.title}
                onChange={(event) => updateForm('title', event.target.value)}
                placeholder="Flash Flood Advisory"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
                <select value={form.category} onChange={(event) => updateForm('category', event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500">
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Severity</span>
                <select value={form.severity} onChange={(event) => updateForm('severity', event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500">
                  {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Affected Area</span>
              <input value={form.area} onChange={(event) => updateForm('area', event.target.value)} placeholder="Brgy. Calog Norte" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500" />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">Map Pin</span>
                {form.coordinates && (
                  <button type="button" onClick={() => updateForm('coordinates', null)} className="text-xs font-medium text-red-400 hover:text-red-300">
                    Clear pin
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <LeafletIncidentMap
                  height="260px"
                  incidents={[]}
                  showMarkers={false}
                  advisoryMarkers={previewMarker}
                  selectedAdvisoryId={previewMarker[0]?.id}
                  showControls={false}
                  showHeatmap={false}
                  showDangerZones={false}
                  compact
                  autoFit={Boolean(form.coordinates)}
                  onMapClick={(latlng) => updateForm('coordinates', { lat: latlng.lat, lng: latlng.lng })}
                />
              </div>
              <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span>
                  {form.coordinates
                    ? `Pinned at ${form.coordinates.lat.toFixed(5)}, ${form.coordinates.lng.toFixed(5)}`
                    : 'Click the map to pin where this advisory applies.'}
                </span>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Message</span>
              <textarea value={form.message} onChange={(event) => updateForm('message', event.target.value)} rows={6} placeholder="Describe the risk, affected roads or barangays, and what the public should do." className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500" />
            </label>

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/30 p-1">
              {['published', 'draft'].map((status) => (
                <button key={status} type="button" onClick={() => updateForm('status', status)} className={`rounded-md px-3 py-2 text-xs font-semibold capitalize transition-all ${form.status === status ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  {status}
                </button>
              ))}
            </div>

            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
              {form.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {form.id ? 'Save Advisory' : 'Create Advisory'}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-foreground">Advisory Board</h2>
            </div>
            <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
              {['all', 'published', 'draft'].map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${filter === item ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border">
            {filteredAdvisories.map((advisory) => {
              const CategoryIcon = categoryOptions.find((item) => item.value === advisory.category)?.icon || Megaphone;
              return (
                <div key={advisory.id} className="p-4 hover:bg-secondary/30">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${severityStyles[advisory.severity]}`}>
                          <AlertTriangle className="h-3 w-3" />
                          {advisory.severity}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          <CategoryIcon className="h-3 w-3" />
                          {categoryLabel(advisory.category)}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${advisory.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-muted-foreground'}`}>
                          {advisory.status === 'published' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {advisory.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{advisory.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{advisory.message}</p>
                      <div className="mt-2 text-xs text-muted-foreground">{advisory.area} - {formatAdvisoryTime(advisory)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => setForm(advisory)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground" title="Edit advisory">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => toggleStatus(advisory)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground" title={advisory.status === 'published' ? 'Move to draft' : 'Publish advisory'}>
                        {advisory.status === 'published' ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </button>
                      <button onClick={() => removeAdvisory(advisory.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10" title="Delete advisory">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredAdvisories.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No advisories found for this view.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
