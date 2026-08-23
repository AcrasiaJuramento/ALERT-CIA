import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MapPin, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { LeafletIncidentMap } from "../components/map/LeafletIncidentMap";
import { resolveIsabelaPointLocation } from "../data/isabelaBarangayGeometry";
import { ISABELA_MUNICIPALITIES } from "../data/isabelaMunicipalities";
import { deleteLandmark, listLandmarks, saveLandmark } from "../services/supabase";

const CATEGORY_OPTIONS = [
  "school",
  "church",
  "barangay_hall",
  "government",
  "hospital",
  "bridge",
  "intersection",
  "gas_station",
  "commercial",
  "road",
  "other",
];

const EMPTY_FORM = {
  id: "",
  name: "",
  aliases: "",
  category: "other",
  barangay: "",
  municipality: "Echague",
  province: "Isabela",
  latitude: "",
  longitude: "",
  source: "manual",
  sourceId: "",
  officerVerified: true,
  verificationStatus: "officer_verified",
};

function statusTone(status) {
  if (["inside_barangay", "municipality_match"].includes(status)) return "border-green-200 bg-green-50 text-green-700";
  if (status === "conflict") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function verificationTone(status) {
  if (status === "officer_verified") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "auto_verified") return "border-green-200 bg-green-50 text-green-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatCategory(value = "") {
  return value.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function splitAliases(value = "") {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeAlias(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(?:daang\s+maharlika|maharlika\s+(?:highway|road)|national\s+(?:highway|road)|highway)\b/g, "maharlika highway")
    .replace(/[^a-z0-9]+/g, "");
}

function isRoadLocation(form = {}) {
  return /\b(?:road|highway|daang|maharlika|national)\b/i.test([form.name, form.category, form.aliases].join(" "));
}

function suggestedRoadAliases(form = {}) {
  const barangay = String(form.barangay || "").replace(/\s+/g, " ").trim();
  if (!barangay || !isRoadLocation(form)) return [];
  const hyphenBarangay = barangay.replace(/\s+/g, "-");
  const aliases = [
    `Maharlika Highway ${barangay}`,
    `Daang Maharlika ${barangay}`,
    `National Road ${barangay}`,
    `National Highway ${barangay}`,
    `Highway ${barangay}`,
    `${barangay} Maharlika Highway`,
    `${barangay} National Road`,
    `${barangay} Highway`,
  ];
  if (hyphenBarangay !== barangay) {
    aliases.push(`National Road ${hyphenBarangay}`, `Maharlika Highway ${hyphenBarangay}`, `Highway ${hyphenBarangay}`);
  }
  return [...new Map(aliases.map(alias => [normalizeAlias(alias), alias])).values()];
}

function parseCoordinate(value) {
  if (value === "" || value === null || value === undefined) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function toForm(landmark = EMPTY_FORM) {
  return {
    ...EMPTY_FORM,
    ...landmark,
    aliases: Array.isArray(landmark.aliases) ? landmark.aliases.join(", ") : landmark.aliases || "",
    latitude: landmark.latitude ?? "",
    longitude: landmark.longitude ?? "",
    sourceId: landmark.sourceId || "",
    officerVerified: landmark.officerVerified ?? landmark.verificationStatus === "officer_verified",
  };
}

export default function LandmarkMapping() {
  const [landmarks, setLandmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search: "", municipality: "", category: "", validationStatus: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [resolvingPin, setResolvingPin] = useState(false);

  const selectedLandmark = useMemo(
    () => landmarks.find(landmark => landmark.id === selectedId) || null,
    [landmarks, selectedId],
  );

  const mapMarkers = useMemo(() => {
    const formLatitude = parseCoordinate(form.latitude);
    const formLongitude = parseCoordinate(form.longitude);
    const hasFormPin = formLatitude !== null && formLongitude !== null;
    const landmarkMarkers = landmarks
      .map(landmark => (
        landmark.id === form.id && hasFormPin
          ? { ...landmark, latitude: formLatitude, longitude: formLongitude, name: form.name || landmark.name }
          : landmark
      ))
      .filter(landmark => Number.isFinite(Number(landmark.latitude)) && Number.isFinite(Number(landmark.longitude)))
    .map(landmark => ({
      id: `LM-${landmark.id}`,
      recordId: landmark.id,
      sourceKind: "landmark_registry",
      sourceLabel: "Local Landmark Registry",
      type: "other",
      severity: landmark.validationStatus === "conflict" ? "critical" : "moderate",
      title: landmark.name,
      description: `${formatCategory(landmark.category)} landmark for scraper location matching.`,
      barangay: landmark.barangay,
      municipality: landmark.municipality,
      location: [landmark.name, landmark.barangay, landmark.municipality, "Isabela"].filter(Boolean).join(", "),
      lat: Number(landmark.latitude),
      lng: Number(landmark.longitude),
      latitude: Number(landmark.latitude),
      longitude: Number(landmark.longitude),
      status: landmark.verificationStatus === "officer_verified" ? "verified" : "in_route",
      locationPrecision: "landmark",
      coordinateSource: "local_landmark_registry",
      mappingStatus: landmark.validationStatus === "conflict" ? "needs_review" : "exact_geocode",
      locationConfidence: {
        level: landmark.validationStatus === "conflict" ? "unmapped" : "high",
        accuracy: "landmark_based",
        source: "local_landmark_registry",
      },
    }));

    if (!form.id && hasFormPin) {
      landmarkMarkers.push({
        id: "LM-DRAFT-PIN",
        recordId: "draft-pin",
        sourceKind: "landmark_registry",
        sourceLabel: "Pinned draft location",
        type: "other",
        severity: "warning",
        title: form.name || "Pinned location",
        description: "Unsaved location selected from the map.",
        barangay: form.barangay,
        municipality: form.municipality,
        location: [form.name || "Pinned location", form.barangay, form.municipality, "Isabela"].filter(Boolean).join(", "),
        lat: formLatitude,
        lng: formLongitude,
        latitude: formLatitude,
        longitude: formLongitude,
        status: "in_route",
        locationPrecision: "landmark",
        coordinateSource: "manual_map_pin",
        mappingStatus: "needs_review",
        locationConfidence: {
          level: "medium",
          accuracy: "manually_pinned",
          source: "manual_map_pin",
        },
      });
    }

    return landmarkMarkers;
  }, [form.barangay, form.id, form.latitude, form.longitude, form.municipality, form.name, landmarks]);

  const selectedMapMarkerId = useMemo(() => {
    if (form.id) return `LM-${form.id}`;
    if (parseCoordinate(form.latitude) !== null && parseCoordinate(form.longitude) !== null) return "LM-DRAFT-PIN";
    return selectedId ? `LM-${selectedId}` : undefined;
  }, [form.id, form.latitude, form.longitude, selectedId]);
  const pinnedLatitude = parseCoordinate(form.latitude);
  const pinnedLongitude = parseCoordinate(form.longitude);
  const roadAliasSuggestions = useMemo(() => {
    const existing = new Set(splitAliases(form.aliases).map(normalizeAlias));
    return suggestedRoadAliases(form).filter(alias => !existing.has(normalizeAlias(alias))).slice(0, 6);
  }, [form]);

  async function loadLandmarks(nextFilters = filters) {
    setLoading(true);
    try {
      const rows = await listLandmarks({ ...nextFilters, limit: 250 });
      setLandmarks(rows);
      if (selectedId && !rows.some(row => row.id === selectedId)) setSelectedId("");
    } catch (error) {
      toast.error(error.message || "Unable to load landmarks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLandmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (key !== "search") loadLandmarks(next);
  }

  function updateForm(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function addRoadAliases() {
    setForm(current => {
      const byKey = new Map(splitAliases(current.aliases).map(alias => [normalizeAlias(alias), alias]));
      suggestedRoadAliases(current).forEach(alias => {
        const key = normalizeAlias(alias);
        if (!byKey.has(key)) byKey.set(key, alias);
      });
      return { ...current, aliases: [...byKey.values()].join(", ") };
    });
  }

  async function pinLocation(latlng) {
    const latitude = latlng.lat.toFixed(6);
    const longitude = latlng.lng.toFixed(6);
    setForm(current => ({ ...current, latitude, longitude }));
    setResolvingPin(true);

    try {
      const location = await resolveIsabelaPointLocation({ lat: latlng.lat, lng: latlng.lng });
      if (!location) {
        toast.warning("Pin set, but no Isabela barangay boundary matched this point.");
        return;
      }
      setForm(current => ({
        ...current,
        latitude,
        longitude,
        barangay: location.barangay || current.barangay,
        municipality: location.municipality || current.municipality,
        province: location.province || current.province,
      }));
      toast.success(`Pin set in ${location.barangay}, ${location.municipality}.`);
    } catch (error) {
      toast.warning(error.message || "Pin set, but barangay lookup failed.");
    } finally {
      setResolvingPin(false);
    }
  }

  function startCreate() {
    setSelectedId("");
    setForm(EMPTY_FORM);
  }

  function startEdit(landmark) {
    setSelectedId(landmark.id);
    setForm(toForm(landmark));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await saveLandmark(form);
      toast.success(form.id ? "Location updated." : "Location added.");
      setSelectedId(saved.id);
      setForm(toForm(saved));
      await loadLandmarks(filters);
    } catch (error) {
      toast.error(error.message || "Unable to save location.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(landmark) {
    const confirmed = window.confirm(`Remove "${landmark.name}" from the local landmark registry?`);
    if (!confirmed) return;
    try {
      await deleteLandmark(landmark.id);
      toast.success("Location removed.");
      if (selectedId === landmark.id) startCreate();
      await loadLandmarks(filters);
    } catch (error) {
      toast.error(error.message || "Unable to remove landmark.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-background p-4 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Location Matching</h1>
          <p className="text-sm text-muted-foreground">
            Manage validated local places used to match news reports to usable map locations.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={filters.search}
                onChange={event => updateFilter("search", event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") loadLandmarks(filters);
                }}
                placeholder="Search name, barangay, aliases"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => loadLandmarks(filters)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Search landmarks"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={filters.municipality}
                onChange={event => updateFilter("municipality", event.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">All municipalities</option>
                {ISABELA_MUNICIPALITIES.map(municipality => (
                  <option key={municipality} value={municipality}>{municipality}</option>
                ))}
              </select>
              <select
                value={filters.category}
                onChange={event => updateFilter("category", event.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map(category => (
                  <option key={category} value={category}>{formatCategory(category)}</option>
                ))}
              </select>
              <select
                value={filters.validationStatus}
                onChange={event => updateFilter("validationStatus", event.target.value)}
                className="col-span-2 rounded-lg border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">All validation states</option>
                <option value="inside_barangay">Inside barangay</option>
                <option value="municipality_match">Municipality match</option>
                <option value="unchecked">Unchecked</option>
                <option value="conflict">Conflict</option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading landmarks...</div>
            ) : landmarks.length ? landmarks.map(landmark => (
              <button
                key={landmark.id}
                type="button"
                onClick={() => startEdit(landmark)}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50 ${
                  selectedId === landmark.id ? "border-blue-400 bg-blue-50" : "border-border bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{landmark.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[landmark.barangay, landmark.municipality].filter(Boolean).join(", ") || "Location not labeled"}
                    </div>
                  </div>
                  {landmark.validationStatus === "conflict" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-blue-500" />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    {formatCategory(landmark.category)}
                  </span>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusTone(landmark.validationStatus)}`}>
                    {formatCategory(landmark.validationStatus)}
                  </span>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] ${verificationTone(landmark.verificationStatus)}`}>
                    {formatCategory(landmark.verificationStatus)}
                  </span>
                </div>
              </button>
            )) : (
              <div className="p-4 text-sm text-muted-foreground">No landmarks found.</div>
            )}
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[minmax(320px,1fr)_auto] gap-4">
          <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <LeafletIncidentMap
              height="100%"
              incidents={mapMarkers}
              selectedIncidentId={selectedMapMarkerId}
              onMarkerClick={marker => {
                if (marker.recordId === "draft-pin") return;
                const landmarkId = marker.recordId || String(marker.id || "").replace(/^LM-/, "");
                const landmark = landmarks.find(item => item.id === landmarkId);
                if (landmark) startEdit(landmark);
              }}
              onMapClick={pinLocation}
              showHeatmap={false}
              showDangerZones={false}
              accidentProneAreas={[]}
              advisoryMarkers={[]}
              clusterMarkers={false}
              hideLayerControl
              compact
              scope="isabela"
            />
            {pinnedLatitude !== null && pinnedLongitude !== null && (
              <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg">
                {resolvingPin ? "Resolving barangay..." : `Pin: ${pinnedLatitude.toFixed(6)}, ${pinnedLongitude.toFixed(6)}`}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{form.id ? "Edit Location" : "Add Location"}</h2>
                {selectedLandmark?.validationStatus && (
                  <p className="text-xs text-muted-foreground">
                    Validation: {formatCategory(selectedLandmark.validationStatus)}
                  </p>
                )}
              </div>
              {form.id && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Clear form"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <label className="lg:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Landmark name</span>
                <input
                  value={form.name}
                  onChange={event => updateForm("name", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Category</span>
                <select
                  value={form.category}
                  onChange={event => updateForm("category", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {CATEGORY_OPTIONS.map(category => (
                    <option key={category} value={category}>{formatCategory(category)}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <input
                  type="checkbox"
                  checked={form.officerVerified}
                  onChange={event => updateForm("officerVerified", event.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span className="inline-flex items-center gap-1 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Officer verified
                </span>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Municipality</span>
                <select
                  value={form.municipality}
                  onChange={event => updateForm("municipality", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select municipality</option>
                  {ISABELA_MUNICIPALITIES.map(municipality => (
                    <option key={municipality} value={municipality}>{municipality}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Barangay</span>
                <input
                  value={form.barangay}
                  onChange={event => updateForm("barangay", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Latitude</span>
                <input
                  value={form.latitude}
                  onChange={event => updateForm("latitude", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Longitude</span>
                <input
                  value={form.longitude}
                  onChange={event => updateForm("longitude", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  inputMode="decimal"
                  required
                />
              </label>

              <label className="lg:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Aliases</span>
                <input
                  value={form.aliases}
                  onChange={event => updateForm("aliases", event.target.value)}
                  placeholder="Comma-separated names used in news reports"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {roadAliasSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addRoadAliases}
                      className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/20"
                    >
                      Add road aliases
                    </button>
                    {roadAliasSuggestions.slice(0, 3).map(alias => (
                      <span key={alias} className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
                        {alias}
                      </span>
                    ))}
                  </div>
                )}
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Source</span>
                <input
                  value={form.source}
                  onChange={event => updateForm("source", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Source ID</span>
                <input
                  value={form.sourceId}
                  onChange={event => updateForm("sourceId", event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {form.id && (
                <button
                  type="button"
                  onClick={() => handleDelete(form)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Location"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
