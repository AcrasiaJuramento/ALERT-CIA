import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Database, ExternalLink, Filter,
  GitMerge, MapPin, RefreshCw, Search, ShieldCheck, SlidersHorizontal, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  analyzeScraperArticle,
  addOfficerVerifiedLandmarkFromCorrection,
  approveScraperRecordForPublicMap,
  correctScraperRecordLocation,
  listRejectedScraperCandidates,
  listBarangays,
  listLandmarks,
  listScraperRecords,
  listScraperRuns,
  listScraperSourceHealth,
  listScraperSources,
  mergeScraperRecords,
  rejectScraperRecord,
} from "../services/supabase";
import { ISABELA_MUNICIPALITIES } from "../data/isabelaMunicipalities";
import { formatLongDateTime } from "../utils/dateFormat";
import { locationAssessment } from "../utils/locationAccuracy";
import { getScraperJobState, startScraperJob, subscribeScraperJob } from "../services/scraperJobService";
import IncidentLocationPicker from "../components/IncidentLocationPicker";
import { resolveIsabelaBarangayGeometry, resolveIsabelaMunicipalityGeometry } from "../data/isabelaBarangayGeometry";
import { resolveNewsCorrectionLocation } from "../utils/newsLocationResolution";

const REVIEW_STATUSES = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Needs Review" },
  { value: "verified_group", label: "Verified" },
  { value: "ignored", label: "Rejected" },
  { value: "promoted", label: "Promoted" },
];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Any confidence" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const REJECTION_REASONS = [
  { value: "", label: "All reasons" },
  { value: "non_vehicular", label: "Non-vehicular" },
  { value: "outside_isabela", label: "Outside Isabela" },
  { value: "duplicate", label: "Duplicate" },
  { value: "location_unknown", label: "Unknown Location" },
  { value: "low_confidence", label: "Low Confidence" },
  { value: "insufficient_information", label: "Insufficient Info" },
  { value: "outside_date_range", label: "Outside Date Range" },
  { value: "fetch_failed", label: "Source Unavailable" },
  { value: "extract_failed", label: "Article Could Not Be Read" },
];

function healthClass(status = "") {
  if (status === "healthy") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (status === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-border bg-secondary text-muted-foreground";
}

function confidenceClass(value = "") {
  if (value === "high") return "border-green-500/30 bg-green-500/10 text-green-400";
  if (value === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (value === "low") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-border bg-secondary text-muted-foreground";
}

function statusLabel(status = "") {
  if (status === "verified" || status === "approved" || status === "matched") return "Verified";
  if (status === "ignored") return "Rejected";
  if (status === "pending_review" || status === "new") return "Needs Review";
  if (status === "promoted" || status === "imported") return "Promoted";
  return status || "Unknown";
}

function fmt(value) {
  return value ? formatLongDateTime(value) : "-";
}

function publicationLabel(value) {
  return value ? fmt(value) : "Publication date unavailable";
}

function timeLabel(value) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function settledValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function municipalityLabel(item = {}) {
  const normalized = String(item.verifiedMunicipality || item.extractedMunicipality || "")
    .replace(/\b(?:city|municipality)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return ISABELA_MUNICIPALITIES.find(municipality => municipality.toLowerCase() === normalized) || "";
}

function SourceLink({ href }) {
  if (!href) return <span className="text-muted-foreground">No source</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
      Source <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2.5 text-center sm:text-left">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function severityClass(value = "") {
  if (value === "critical" || value === "high") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (value === "warning" || value === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-border bg-secondary text-muted-foreground";
}

function Select({ value, onChange, children }) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs text-foreground">
      {children}
    </select>
  );
}

function coordinateInput(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? String(value) : '';
}

function municipalityLookup(value) {
  return String(value || '').replace(/\b(?:city|municipality)\b/gi, '').trim();
}

function CorrectionPanel({ record, onCancel, onSave }) {
  const [form, setForm] = useState({
    municipality: record.verifiedMunicipality || record.extractedMunicipality || "",
    barangay: record.verifiedBarangay || record.extractedBarangay || "",
    purokSitio: record.verifiedPurokSitio || record.extractedPurokSitio || "",
    road: record.verifiedRoadPlace || record.rawPayload?.location?.road || "",
    latitude: coordinateInput(record.lat),
    longitude: coordinateInput(record.lon),
    accuracy: record.locationConfidence?.accuracy || "barangay_only",
    source: record.locationConfidence?.source || "barangay_centroid",
    reason: record.locationConfidence?.reason || "",
    saveLandmark: false,
    landmarkName: record.rawPayload?.location?.landmark || "",
    landmarkCategory: "other",
    aliases: "",
  });
  const [resolution, setResolution] = useState(null);
  const [resolving, setResolving] = useState(true);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const updateAccuracy = (value) => {
    const source = value === "near_exact" ? "manual_exact" : value === "road_level" ? "road" : value === "unmapped" ? "unmapped" : "barangay_centroid";
    setForm(current => ({ ...current, accuracy: value, source }));
  };

  useEffect(() => {
    let active = true;
    async function resolveStartingLocation() {
      setResolving(true);
      const municipality = municipalityLookup(record.verifiedMunicipality || record.extractedMunicipality);
      const [landmarkResult, barangayResult] = await Promise.allSettled([
        listLandmarks({ municipality, limit: 500 }),
        listBarangays({
          activeOnly: false,
          municipality,
        }),
      ]);
      const next = await resolveNewsCorrectionLocation(record, {
        landmarks: settledValue(landmarkResult, []),
        barangays: settledValue(barangayResult, []),
        resolveBarangay: resolveIsabelaBarangayGeometry,
        resolveMunicipality: resolveIsabelaMunicipalityGeometry,
      });
      if (!active) return;
      setResolution(next);
      setForm(current => ({
        ...current,
        municipality: current.municipality || next.municipality || "",
        barangay: current.barangay || next.barangay || "",
        purokSitio: current.purokSitio || next.purokSitio || "",
        road: current.road || next.road || "",
        latitude: coordinateInput(next.latitude),
        longitude: coordinateInput(next.longitude),
        accuracy: next.accuracy,
        source: next.source,
        reason: next.label,
        landmarkName: current.landmarkName || next.matchedRecord?.name || "",
      }));
      setResolving(false);
    }
    resolveStartingLocation().catch(() => {
      if (active) setResolving(false);
    });
    return () => { active = false; };
  }, [record]);

  const updatePin = location => {
    const manuallyAdjusted = Boolean(location.pinAdjusted);
    setForm(current => ({
      ...current,
      municipality: location.municipality || current.municipality,
      barangay: location.barangay || current.barangay,
      latitude: coordinateInput(location.latitude),
      longitude: coordinateInput(location.longitude),
      accuracy: manuallyAdjusted ? "near_exact" : current.accuracy,
      source: manuallyAdjusted ? "manual_exact" : current.source,
      reason: manuallyAdjusted ? "Officer selected the incident pin manually." : current.reason,
    }));
    if (manuallyAdjusted) {
      setResolution(current => ({
        ...(current || {}),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: "near_exact",
        source: "manual_exact",
        label: "Officer-selected exact incident location",
        approximate: false,
      }));
    }
  };

  const pickerLocationText = [form.road, form.purokSitio, form.barangay, form.municipality, "Isabela"].filter(Boolean).join(", ") || record.rawLocationText || record.location;
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 md:grid-cols-4">
      {["municipality", "barangay", "purokSitio", "road"].map(key => (
        <input
          key={key}
          value={form[key]}
          onChange={event => update(key, event.target.value)}
          placeholder={key === "purokSitio" ? "Purok / Sitio" : key}
          className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs"
        />
      ))}
      <div className="md:col-span-4">
        {resolving ? (
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin text-blue-400" />Resolving the best available article location...
          </div>
        ) : (
          <IncidentLocationPicker
            scope="isabela"
            value={form}
            locationText={pickerLocationText}
            locationNotice={resolution?.label || "Location needs manual confirmation"}
            approximate={resolution?.approximate !== false}
            onChange={updatePin}
            height={320}
          />
        )}
      </div>
      <input value={form.latitude} onChange={event => update("latitude", event.target.value)} placeholder="Latitude (optional)" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" />
      <input value={form.longitude} onChange={event => update("longitude", event.target.value)} placeholder="Longitude (optional)" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" />
      <select value={form.accuracy} onChange={event => updateAccuracy(event.target.value)} className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs">
        <option value="near_exact">Exact / landmark-based</option>
        <option value="road_level">Road / purok / sitio level</option>
        <option value="barangay_only">Approximate barangay only</option>
        <option value="unmapped">Unmapped / conflicting</option>
      </select>
      <input value={form.reason} onChange={event => update("reason", event.target.value)} placeholder="Correction note (optional)" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" />
      <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-input-background px-3 text-xs md:col-span-4">
        <input type="checkbox" checked={form.saveLandmark} onChange={event => update("saveLandmark", event.target.checked)} className="accent-blue-600" />
        Add to the verified Location Matching registry
      </label>
      {form.saveLandmark && (
        <>
          <input value={form.landmarkName} onChange={event => update("landmarkName", event.target.value)} placeholder="Landmark name" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" />
          <select value={form.landmarkCategory} onChange={event => update("landmarkCategory", event.target.value)} className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs">
            {["school", "church", "hospital", "clinic", "barangay hall", "government office", "police station", "fire station", "fuel station", "market", "bridge", "terminal", "commercial establishment", "intersection", "other"].map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input value={form.aliases} onChange={event => update("aliases", event.target.value)} placeholder="Aliases, comma separated" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs md:col-span-2" />
        </>
      )}
      <div className="flex gap-2 md:col-span-4">
        <button onClick={() => onSave(form)} disabled={resolving} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">Save Correction</button>
        <button onClick={onCancel} className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold">Cancel</button>
      </div>
    </div>
  );
}

function RecordCard({ record, records, onRefresh, initiallyOpen = false, initiallyCorrecting = false }) {
  const cardRef = useRef(null);
  const [reviewing, setReviewing] = useState(initiallyOpen);
  const [correcting, setCorrecting] = useState(initiallyCorrecting);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const assessment = locationAssessment({
    ...record,
    locationPrecision: record.geocodePrecision,
    mappingStatus: record.mappingStatus,
    sourceKind: "scraped",
  });

  const verify = async () => {
    await approveScraperRecordForPublicMap(record.id);
    toast.success("Article verified for map intelligence.");
    onRefresh();
  };
  const reject = async () => {
    const reason = window.prompt("Reason for rejection", record.rejectedReason || "Not a reliable vehicular accident record.");
    if (!reason) return;
    await rejectScraperRecord(record.id, reason);
    toast.success("Article rejected.");
    onRefresh();
  };
  const saveCorrection = async (form) => {
    await correctScraperRecordLocation(record.id, form);
    if (form.saveLandmark) {
      await addOfficerVerifiedLandmarkFromCorrection(record, form);
    }
    toast.success("Location correction saved.");
    setCorrecting(false);
    onRefresh();
  };
  const merge = async () => {
    if (!mergeTarget) return;
    await mergeScraperRecords(record.id, mergeTarget);
    toast.success("Duplicate merged into target record.");
    onRefresh();
  };

  useEffect(() => {
    if (!initiallyOpen) return;
    window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
  }, [initiallyOpen]);

  return (
    <article ref={cardRef} className={`overflow-hidden rounded-lg border bg-card transition ${reviewing ? "border-blue-500/40 shadow-lg" : "border-border hover:border-blue-500/30"}`}>
      <div className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {record.severity && <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${severityClass(record.severity)}`}>{record.severity}</span>}
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{statusLabel(record.status)}</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{publicationLabel(record.publishedAt)}</span>
            </div>
            <h3 className="mt-2 break-words text-sm font-bold leading-snug text-foreground">{record.title || "Untitled news report"}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{record.snippet || "No article preview is available."}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground/80">{record.sourceSite || "Unknown news source"}</span>
              <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0 text-blue-400" /><span className="truncate">{record.verifiedBarangay || record.extractedBarangay || record.rawLocationText || "Location needs confirmation"}{(record.verifiedMunicipality || record.extractedMunicipality) ? `, ${record.verifiedMunicipality || record.extractedMunicipality}` : ""}</span></span>
            </div>
          </div>
          <button
            onClick={() => setReviewing(current => !current)}
            aria-expanded={reviewing}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            {reviewing ? "Close Review" : "Review"}<ChevronDown className={`h-4 w-4 transition-transform ${reviewing ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {reviewing && (
        <div className="border-t border-border bg-background/25 p-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Article Summary</div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{record.snippet || "No article summary is available."}</p>
              {record.sourceUrl ? (
                <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 hover:bg-blue-500/20">
                  View Original Article <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <div className="mt-3 text-xs text-muted-foreground">Original article link unavailable.</div>
              )}
            </div>
            <aside className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Location</div>
              <div className="mt-1 break-words text-sm font-semibold text-foreground">
                {[record.verifiedRoadPlace, record.verifiedBarangay || record.extractedBarangay, record.verifiedMunicipality || record.extractedMunicipality].filter(Boolean).join(", ") || record.rawLocationText || "Not confirmed"}
              </div>
              {assessment.approximate && <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Location needs confirmation</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/admin/map?record=${encodeURIComponent(record.id)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80"><MapPin className="h-3.5 w-3.5" />View on Map</Link>
                <button onClick={() => setCorrecting(current => !current)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"><MapPin className="h-3.5 w-3.5" />Correct Location</button>
              </div>
            </aside>
          </div>

          {correcting && <CorrectionPanel record={record} onCancel={() => setCorrecting(false)} onSave={saveCorrection} />}

          <details className="group mt-4 rounded-lg border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
              See More
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-2 border-t border-border p-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detected Location</span>{record.extractedBarangay || "-"}, {record.extractedMunicipality || "Isabela"}</div>
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Location Mentioned in Article</span>{record.rawLocationText || record.location || "-"}</div>
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Location Match</span>{assessment.label}</div>
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detection Confidence</span>{record.classificationConfidence || "Unscored"}{Number.isFinite(record.classificationScore) && record.classificationScore > 0 ? ` / ${Math.round(record.classificationScore * 100)}%` : ""}</div>
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Article Retrieved</span>{fmt(record.scrapedAt)}</div>
              <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detection Information</span>{record.classificationReason || "Legacy record needs review."}</div>
            </div>
          </details>

          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button onClick={verify} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700"><CheckCircle2 className="h-4 w-4" />Verify Article</button>
              <button onClick={() => setCheckingDuplicates(current => !current)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold hover:bg-secondary/80"><GitMerge className="h-4 w-4" />Check Duplicates</button>
            </div>
            <button onClick={reject} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-300 hover:bg-red-500/20"><XCircle className="h-4 w-4" />Reject</button>
          </div>

          {checkingDuplicates && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
              <GitMerge className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-input-background px-2 text-xs">
                <option value="">Select a possible duplicate...</option>
                {records.filter(item => item.id !== record.id).slice(0, 30).map(item => (
                  <option key={item.id} value={item.id}>{item.title || item.id}</option>
                ))}
              </select>
              <button onClick={merge} disabled={!mergeTarget} className="h-10 rounded-md bg-secondary px-3 text-xs font-semibold disabled:opacity-50">Merge Selected</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function CandidateCard({ candidate }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase text-red-300">{candidate.rejectionReason}</span>
        <span className="text-[10px] text-muted-foreground">{candidate.sourceSite}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{publicationLabel(candidate.publishedAt)}</span>
      </div>
      <h3 className="mt-2 break-words text-sm font-bold text-foreground">{candidate.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{candidate.rejectionDetails || candidate.classificationReason || "No rejection details recorded."}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{candidate.extractedBarangay || "Unknown location"}{candidate.extractedMunicipality ? `, ${candidate.extractedMunicipality}` : ""}</span>
        <SourceLink href={candidate.sourceUrl} />
      </div>
      <details className="group mt-3 rounded-lg border border-border bg-background/40">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold">See More <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-2 border-t border-border p-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detection Information</span>{candidate.detectedIncidentType || "-"}</div>
          <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detection Confidence</span>{candidate.classificationConfidence || "Unscored"}</div>
          <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Processed</span>{fmt(candidate.createdAt)}</div>
        </div>
      </details>
    </article>
  );
}

function SourceHealthPanel({ healthRows }) {
  return (
    <details className="group mt-3 rounded-lg border border-border bg-background/30">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        News source details
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              {["Source", "Status", "Links", "Articles", "Matched", "Rejected", "Errors", "Retries", "Last Checked", "Details"].map(item => (
                <th key={item} className="border-b border-border px-3 py-2 text-left font-semibold">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {healthRows.map(row => (
              <tr key={row.sourceId || row.sourceKey} className="border-b border-border/50">
                <td className="px-3 py-2 font-semibold text-foreground">{row.sourceName}</td>
                <td className="px-3 py-2"><span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${healthClass(row.status)}`}>{row.status}</span></td>
                <td className="px-3 py-2 text-blue-300">{row.linksFound}</td>
                <td className="px-3 py-2">{row.articlesProcessed}</td>
                <td className="px-3 py-2 text-green-300">{row.incidentsDetected}</td>
                <td className="px-3 py-2 text-amber-300">{row.rejectedCount}</td>
                <td className="px-3 py-2 text-red-300">{row.failedCount}</td>
                <td className="px-3 py-2">{row.retries}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmt(row.lastScrapedAt)}</td>
                <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">{row.lastError || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!healthRows.length && <div className="py-6 text-center text-xs text-muted-foreground">No source check details are available yet.</div>}
      </div>
    </details>
  );
}

function NewsSourceCheck({ runs, healthRows, running, onCheck }) {
  const latest = runs[0];
  const metadata = latest?.metadata || {};
  const metadataHealth = Array.isArray(metadata.source_health) ? metadata.source_health : [];
  const health = metadataHealth.length ? metadataHealth : healthRows;
  const partialErrors = Array.isArray(metadata.partial_errors) ? metadata.partial_errors : [];
  const failedSources = health.filter(item => item.status === "failed").length;
  const warningSources = health.filter(item => item.status === "warning").length;
  const showRunError = latest?.status === "failed" && latest?.error_message;
  return (
    <section className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-4 w-4 ${latest?.status === "failed" ? "text-red-400" : "text-green-400"}`} />
            <h2 className="text-sm font-bold text-foreground">{running ? "Checking News Sources" : latest ? "Check Complete" : "Check News Sources"}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Operational summary from the latest news source check.</p>
        </div>
        <button onClick={onCheck} disabled={running} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />{running ? "Checking..." : latest ? "Check Again" : "Check News Sources"}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/30 sm:grid-cols-4 sm:divide-y-0">
        <StatItem label="Articles Found" value={latest?.fetched_count ?? "-"} />
        <StatItem label="Matched" value={latest?.matched_count ?? "-"} />
        <StatItem label="Rejected" value={metadata.rejected_count ?? "-"} />
        <StatItem label="Last Checked" value={timeLabel(latest?.completed_at || latest?.started_at)} />
      </div>
      {(failedSources > 0 || warningSources > 0) && <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{failedSources + warningSources} news source{failedSources + warningSources === 1 ? "" : "s"} could not be fully checked. Open details below for technical information.</div>}
      {showRunError && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{latest.error_message}</div>}
      {!showRunError && partialErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {partialErrors.length} article save issue{partialErrors.length === 1 ? "" : "s"} were skipped after the run completed.
        </div>
      )}
      <SourceHealthPanel healthRows={healthRows} />
    </section>
  );
}

function AnalyzerPanel() {
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    if (!url.trim() && !body.trim()) {
      toast.error("Paste a news URL or article text first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const payload = await analyzeScraperArticle({ url: url.trim(), body: body.trim() });
      setResult(payload);
    } catch (error) {
      toast.error(error.message || "Unable to analyze article.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="group mb-5 rounded-lg border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        Article analysis tools
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-4">
        <p className="mb-3 text-xs text-muted-foreground">Preview classification and location detection without saving the article.</p>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://news-site.example/article-about-cauayan-accident"
          className="h-10 rounded-lg border border-border bg-input-background px-3 text-xs"
        />
        <button onClick={analyze} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
          <Search className="h-4 w-4" />{loading ? "Analyzing..." : "Analyze"}
        </button>
        </div>
        <textarea
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder="Or paste article text here..."
        className="mt-3 min-h-24 w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs"
      />
        {result && (
        <div className={`mt-4 rounded-lg border p-4 ${result.accepted ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${result.accepted ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
              {result.accepted ? "Would Accept" : `Would Reject: ${result.rejection_reason}`}
            </span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${confidenceClass(result.classification?.confidence)}`}>
              {result.classification?.confidence || "No confidence"} / {Math.round((result.classification?.score || 0) * 100)}%
            </span>
          </div>
          <h3 className="mt-3 text-sm font-bold text-foreground">{result.article?.title || "Untitled article"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{result.decision_details}</p>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Type</span>{result.classification?.type || "-"}</div>
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Location</span>{result.location?.locationText || "-"}</div>
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Coordinates</span>{result.geocode?.lat && result.geocode?.lon ? `${Number(result.geocode.lat).toFixed(5)}, ${Number(result.geocode.lon).toFixed(5)}` : "-"}</div>
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Vehicles</span>{result.structured?.vehicleTypes?.join(", ") || "-"}</div>
          </div>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Injured</span>{result.structured?.injuredCount ?? "-"}</div>
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Fatalities</span>{result.structured?.fatalityCount ?? "-"}</div>
            <div className="rounded-lg bg-background/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Parties</span>{result.structured?.involvedParties?.join(", ") || "-"}</div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">Matched terms: {result.classification?.matchedTerms?.join(", ") || "none"}</p>
        </div>
        )}
      </div>
    </details>
  );
}

export default function ScraperReview() {
  const [searchParams] = useSearchParams();
  const focusRecordId = searchParams.get("record") || "";
  const shouldOpenCorrection = searchParams.get("correct") === "1";
  const [tab, setTab] = useState("records");
  const [records, setRecords] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [sourceHealth, setSourceHealth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraperJob, setScraperJob] = useState(getScraperJobState());
  const [filters, setFilters] = useState({
    status: "pending_review",
    sourceId: "",
    municipality: "",
    confidence: "",
    reason: "",
    dateFrom: "",
    dateTo: "",
  });
  const [query, setQuery] = useState("");
  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!focusRecordId) return;
    setTab("records");
    setFilters(current => ({ ...current, status: "", sourceId: "", municipality: "", confidence: "" }));
    setQuery("");
  }, [focusRecordId]);

  const load = async () => {
    setLoading(true);
    try {
      const [recordResult, candidateResult, sourceResult, runResult, healthResult] = await Promise.allSettled([
        listScraperRecords({
          sourceId: filters.sourceId,
          municipality: filters.municipality,
          confidence: filters.confidence,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: 500,
        }),
        listRejectedScraperCandidates({
          reason: filters.reason,
          sourceId: filters.sourceId,
          municipality: filters.municipality,
          confidence: filters.confidence,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: 500,
        }),
        listScraperSources(),
        listScraperRuns({ limit: 10 }),
        listScraperSourceHealth(),
      ]);
      const recordRows = settledValue(recordResult, []);
      const candidateRows = settledValue(candidateResult, []);
      const sourceRows = settledValue(sourceResult, []);
      const runRows = settledValue(runResult, []);
      const healthRows = settledValue(healthResult, []);
      const activeSourceKeys = new Set((sourceRows || []).map(source => source.source_key || source.key));
      setRecords(recordRows);
      setCandidates(candidateRows);
      setSources(sourceRows || []);
      setRuns(runRows || []);
      setSourceHealth((healthRows || []).filter(row => activeSourceKeys.has(row.sourceKey)));

      const requiredFailure = [recordResult, candidateResult, sourceResult].find(result => result.status === "rejected");
      const diagnosticsFailure = [runResult, healthResult].find(result => result.status === "rejected");
      if (requiredFailure) {
        toast.error(requiredFailure.reason?.message || "Some news review records could not be loaded.");
      } else if (diagnosticsFailure) {
        toast.warning("News records loaded, but source check details are temporarily unavailable.");
      }
    } catch (error) {
      toast.error(error.message || "Unable to load the news review queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.sourceId, filters.municipality, filters.confidence, filters.reason, filters.dateFrom, filters.dateTo]);

  useEffect(() => subscribeScraperJob(setScraperJob), []);

  const checkNewsSources = async () => {
    try {
      await startScraperJob("update", { pageFrom: 1, pageTo: 1 });
      await load();
    } catch (error) {
      toast.error(error.message || "Unable to check news sources.");
    }
  };

  const visibleRecords = useMemo(() => records.filter(record => {
    const needle = query.toLowerCase();
    const matchesQuery = !needle || [record.title, record.snippet, record.extractedMunicipality, record.extractedBarangay, record.sourceSite].some(value => String(value || "").toLowerCase().includes(needle));
    const matchesMunicipality = !filters.municipality || municipalityLabel(record) === filters.municipality;
    const matchesStatus = !filters.status ||
      (filters.status === "pending_review" && ["pending_review", "new"].includes(record.status)) ||
      (filters.status === "verified_group" && ["verified", "approved", "matched"].includes(record.status)) ||
      (filters.status === "promoted" && ["promoted", "imported"].includes(record.status)) ||
      record.status === filters.status;
    return matchesQuery && matchesMunicipality && matchesStatus;
  }), [filters.municipality, filters.status, query, records]);
  const visibleCandidates = useMemo(() => candidates.filter(candidate => {
    const needle = query.toLowerCase();
    const matchesQuery = !needle || [candidate.title, candidate.snippet, candidate.extractedMunicipality, candidate.extractedBarangay, candidate.rejectionReason, candidate.sourceSite].some(value => String(value || "").toLowerCase().includes(needle));
    const matchesMunicipality = !filters.municipality || municipalityLabel(candidate) === filters.municipality;
    return matchesQuery && matchesMunicipality;
  }), [candidates, filters.municipality, query]);
  const latestRun = runs[0];

  return (
    <div className="min-h-full bg-background p-3 sm:p-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="mb-5 flex flex-col justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
            <Database className="h-3 w-3" /> External Accident Intelligence
          </div>
          <h1 className="text-2xl font-bold text-foreground">News Review</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Review external accident reports before they contribute to map and analytics intelligence. Verification does not create an official MDRRMO incident.</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        <StatItem label="Review Queue" value={records.filter(item => ["pending_review", "new"].includes(item.status)).length} />
        <StatItem label="Verified" value={records.filter(item => ["verified", "approved", "matched", "promoted", "imported"].includes(item.status)).length} />
        <StatItem label="Rejected" value={candidates.length + records.filter(item => item.status === "ignored").length} />
        <StatItem label="Articles Found" value={latestRun?.fetched_count ?? "-"} />
        <StatItem label="Last Checked" value={timeLabel(latestRun?.completed_at || latestRun?.started_at)} />
      </div>

      <NewsSourceCheck runs={runs} healthRows={sourceHealth} running={scraperJob.running} onCheck={checkNewsSources} />
      <AnalyzerPanel />

      <div className="mb-5 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, location, source..." className="h-9 w-full rounded-lg border border-border bg-input-background pl-9 pr-3 text-xs" />
          </div>
          <Select value={filters.status} onChange={value => updateFilter("status", value)}>{REVIEW_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
          <Select value={filters.sourceId} onChange={value => updateFilter("sourceId", value)}><option value="">All sources</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
          <Select value={filters.confidence} onChange={value => updateFilter("confidence", value)}>{CONFIDENCE_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
          <Select value={filters.municipality} onChange={value => updateFilter("municipality", value)}>
            <option value="">All municipalities</option>
            {ISABELA_MUNICIPALITIES.map(municipality => <option key={municipality} value={municipality}>{municipality}</option>)}
          </Select>
          <input value={filters.dateFrom} onChange={event => updateFilter("dateFrom", event.target.value)} type="date" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" title="From date" />
          <input value={filters.dateTo} onChange={event => updateFilter("dateTo", event.target.value)} type="date" className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs" title="To date" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTab("records")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "records" ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground"}`}><ShieldCheck className="h-4 w-4" />Review Queue</button>
        <button onClick={() => setTab("rejected")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "rejected" ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground"}`}><SlidersHorizontal className="h-4 w-4" />Rejected Articles</button>
        {tab === "rejected" && <Select value={filters.reason} onChange={value => updateFilter("reason", value)}>{REJECTION_REASONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>}
      </div>

      <div className="space-y-3">
        {tab === "records"
          ? visibleRecords.map(record => (
            <RecordCard
              key={`${record.id}-${String(record.id) === String(focusRecordId) ? 'focused' : 'normal'}-${shouldOpenCorrection ? 'correct' : 'view'}`}
              record={record}
              records={records}
              onRefresh={load}
              initiallyOpen={String(record.id) === String(focusRecordId)}
              initiallyCorrecting={String(record.id) === String(focusRecordId) && shouldOpenCorrection}
            />
          ))
          : visibleCandidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} />)}
        {!loading && tab === "records" && !visibleRecords.length && <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No news reports match the filters.</div>}
        {!loading && tab === "rejected" && !visibleCandidates.length && <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No rejected article candidates match the filters.</div>}
      </div>
    </div>
  );
}
