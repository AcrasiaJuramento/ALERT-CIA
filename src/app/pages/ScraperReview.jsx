import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Database, ExternalLink, Filter, GitMerge, MapPin, RefreshCw,
  Search, ShieldCheck, SlidersHorizontal, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  analyzeScraperArticle,
  approveScraperRecordForPublicMap,
  correctScraperRecordLocation,
  listRejectedScraperCandidates,
  listScraperRecords,
  listScraperRuns,
  listScraperSourceHealth,
  listScraperSources,
  mergeScraperRecords,
  rejectScraperRecord,
} from "../services/supabase";
import { ISABELA_MUNICIPALITIES } from "../data/isabelaMunicipalities";
import { formatLongDateTime } from "../utils/dateFormat";

const REVIEW_STATUSES = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Needs Review" },
  { value: "new", label: "New" },
  { value: "approved", label: "Verified" },
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
  { value: "fetch_failed", label: "Fetch Failed" },
  { value: "extract_failed", label: "Extract Failed" },
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
  if (status === "approved" || status === "matched") return "Verified";
  if (status === "ignored") return "Rejected";
  if (status === "pending_review" || status === "new") return "Needs Review";
  if (status === "promoted" || status === "imported") return "Promoted";
  return status || "Unknown";
}

function fmt(value) {
  return value ? formatLongDateTime(value) : "-";
}

function settledValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function locationLabel(item = {}) {
  return [
    item.verifiedBarangay || item.extractedBarangay,
    item.verifiedMunicipality || item.extractedMunicipality,
  ].filter(Boolean).join(", ");
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

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-lg border border-border bg-input-background px-3 text-xs text-foreground">
      {children}
    </select>
  );
}

function CorrectionPanel({ record, onCancel, onSave }) {
  const [form, setForm] = useState({
    municipality: record.verifiedMunicipality || record.extractedMunicipality || "",
    barangay: record.verifiedBarangay || record.extractedBarangay || "",
    purokSitio: record.verifiedPurokSitio || record.extractedPurokSitio || "",
    road: record.verifiedRoadPlace || record.rawPayload?.location?.road || "",
  });
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
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
      <div className="flex gap-2 md:col-span-4">
        <button onClick={() => onSave(form)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save Correction</button>
        <button onClick={onCancel} className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold">Cancel</button>
      </div>
    </div>
  );
}

function RecordCard({ record, records, onRefresh }) {
  const [correcting, setCorrecting] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");

  const verify = async () => {
    await approveScraperRecordForPublicMap(record.id);
    toast.success("Scraped incident verified for external intelligence.");
    onRefresh();
  };
  const reject = async () => {
    const reason = window.prompt("Reason for rejection", record.rejectedReason || "Not a reliable vehicular accident record.");
    if (!reason) return;
    await rejectScraperRecord(record.id, reason);
    toast.success("Scraper record rejected.");
    onRefresh();
  };
  const saveCorrection = async (form) => {
    await correctScraperRecordLocation(record.id, form);
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

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{statusLabel(record.status)}</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${confidenceClass(record.classificationConfidence)}`}>
              {record.classificationConfidence || "Unscored"}
            </span>
            <span className="text-[10px] text-muted-foreground">{record.sourceSite}</span>
            <SourceLink href={record.sourceUrl} />
          </div>
          <h3 className="mt-2 text-sm font-bold text-foreground">{record.title || "Untitled scraped accident"}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{record.snippet || "No article snippet extracted."}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={verify} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/10 px-2 text-xs font-semibold text-green-300 hover:bg-green-500/20"><CheckCircle2 className="h-4 w-4" />Verify</button>
          <button onClick={reject} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"><XCircle className="h-4 w-4" />Reject</button>
          <button onClick={() => setCorrecting(current => !current)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20"><MapPin className="h-4 w-4" />Correct</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">{record.verifiedBarangay || record.verifiedMunicipality ? "Verified Location" : "Extracted Location"}</span>{record.verifiedBarangay || record.extractedBarangay || "-"}, {record.verifiedMunicipality || record.extractedMunicipality || "Isabela"}</div>
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Raw Location</span>{record.rawLocationText || record.location || "-"}</div>
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Classification</span>{record.classificationReason || "Legacy record needs review."}</div>
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Scraped</span>{fmt(record.scrapedAt)}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/40 p-2">
        <GitMerge className="h-4 w-4 text-muted-foreground" />
        <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} className="h-8 min-w-64 rounded-md border border-border bg-input-background px-2 text-xs">
          <option value="">Merge this as duplicate into...</option>
          {records.filter(item => item.id !== record.id).slice(0, 30).map(item => (
            <option key={item.id} value={item.id}>{item.title || item.id}</option>
          ))}
        </select>
        <button onClick={merge} disabled={!mergeTarget} className="h-8 rounded-md bg-secondary px-3 text-xs font-semibold disabled:opacity-50">Merge</button>
      </div>
      {correcting && <CorrectionPanel record={record} onCancel={() => setCorrecting(false)} onSave={saveCorrection} />}
    </article>
  );
}

function CandidateCard({ candidate }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase text-red-300">{candidate.rejectionReason}</span>
        <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${confidenceClass(candidate.classificationConfidence)}`}>{candidate.classificationConfidence || "No confidence"}</span>
        <span className="text-[10px] text-muted-foreground">{candidate.sourceSite}</span>
        <SourceLink href={candidate.sourceUrl} />
      </div>
      <h3 className="mt-2 text-sm font-bold text-foreground">{candidate.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{candidate.rejectionDetails || candidate.classificationReason || "No rejection details recorded."}</p>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Detected</span>{candidate.detectedIncidentType || "-"}</div>
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Location</span>{candidate.extractedBarangay || "-"}, {candidate.extractedMunicipality || "-"}</div>
        <div className="rounded-lg bg-secondary/60 p-2"><span className="block text-[10px] uppercase text-muted-foreground">Logged</span>{fmt(candidate.createdAt)}</div>
      </div>
    </article>
  );
}

function SourceHealthPanel({ healthRows }) {
  return (
    <section className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Source Health</h2>
          <p className="text-xs text-muted-foreground">Latest per-source scraper diagnostics from the last run touching each publisher.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              {["Source", "Status", "Links", "Articles", "Detected", "Rejected", "Failed", "Retries", "Last Scraped", "Last Error"].map(item => (
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
        {!healthRows.length && <div className="py-6 text-center text-xs text-muted-foreground">No source health rows yet. Run the scraper once after migration 66 is deployed.</div>}
      </div>
    </section>
  );
}

function RunDiagnostics({ runs }) {
  const latest = runs[0];
  const metadata = latest?.metadata || {};
  const health = Array.isArray(metadata.source_health) ? metadata.source_health : [];
  const partialErrors = Array.isArray(metadata.partial_errors) ? metadata.partial_errors : [];
  const failedSources = health.filter(item => item.status === "failed").length;
  const warningSources = health.filter(item => item.status === "warning").length;
  const showRunError = latest?.status === "failed" && latest?.error_message;
  return (
    <section className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-foreground">Run Diagnostics</h2>
        <p className="text-xs text-muted-foreground">Last scraper run summary, including rejected article and source health counts.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Fetched" value={latest?.fetched_count ?? "-"} />
        <Metric label="Inserted" value={latest?.inserted_count ?? "-"} />
        <Metric label="Matched" value={latest?.matched_count ?? "-"} />
        <Metric label="Rejected" value={metadata.rejected_count ?? "-"} />
        <Metric label="Failed Sources" value={failedSources || warningSources ? `${failedSources}/${warningSources}` : "0"} />
      </div>
      {showRunError && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{latest.error_message}</div>}
      {!showRunError && partialErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {partialErrors.length} article save issue{partialErrors.length === 1 ? "" : "s"} were skipped after the run completed.
        </div>
      )}
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
    <section className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-foreground">Article QA Analyzer</h2>
        <p className="text-xs text-muted-foreground">Paste a URL or article text to preview scraper classification, location extraction, and accept/reject decision without saving anything.</p>
      </div>
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
    </section>
  );
}

export default function ScraperReview() {
  const [tab, setTab] = useState("records");
  const [records, setRecords] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [sourceHealth, setSourceHealth] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const load = async () => {
    setLoading(true);
    try {
      const [recordResult, candidateResult, sourceResult, runResult, healthResult] = await Promise.allSettled([
        listScraperRecords({
          status: filters.status,
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
        toast.error(requiredFailure.reason?.message || "Some scraper review records could not be loaded.");
      } else if (diagnosticsFailure) {
        toast.warning("Scraper records loaded, but run diagnostics are temporarily unavailable.");
      }
    } catch (error) {
      toast.error(error.message || "Unable to load scraper review queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.sourceId, filters.municipality, filters.confidence, filters.reason, filters.dateFrom, filters.dateTo]);

  const visibleRecords = useMemo(() => records.filter(record => {
    const needle = query.toLowerCase();
    const matchesQuery = !needle || [record.title, record.snippet, record.extractedMunicipality, record.extractedBarangay, record.sourceSite].some(value => String(value || "").toLowerCase().includes(needle));
    const matchesMunicipality = !filters.municipality || municipalityLabel(record) === filters.municipality;
    return matchesQuery && matchesMunicipality;
  }), [filters.municipality, query, records]);
  const visibleCandidates = useMemo(() => candidates.filter(candidate => {
    const needle = query.toLowerCase();
    const matchesQuery = !needle || [candidate.title, candidate.snippet, candidate.extractedMunicipality, candidate.extractedBarangay, candidate.rejectionReason, candidate.sourceSite].some(value => String(value || "").toLowerCase().includes(needle));
    const matchesMunicipality = !filters.municipality || municipalityLabel(candidate) === filters.municipality;
    return matchesQuery && matchesMunicipality;
  }), [candidates, filters.municipality, query]);
  const latestRun = runs[0];

  return (
    <div className="min-h-full bg-background p-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="mb-5 flex flex-col justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
            <Database className="h-3 w-3" /> External Accident Intelligence
          </div>
          <h1 className="text-2xl font-bold text-foreground">Scraper Review</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Verify external accident reports before they contribute to map and analytics intelligence. This does not create official MDRRMO incidents.</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Metric label="Review Queue" value={records.filter(item => ["pending_review", "new"].includes(item.status)).length} />
        <Metric label="Verified Loaded" value={records.filter(item => ["approved", "matched", "promoted", "imported"].includes(item.status)).length} />
        <Metric label="Rejected Articles" value={candidates.length} />
        <Metric label="Last Run Articles" value={latestRun?.fetched_count ?? "-"} />
      </div>

      <RunDiagnostics runs={runs} />
      <SourceHealthPanel healthRows={sourceHealth} />
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

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab("records")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "records" ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground"}`}><ShieldCheck className="h-4 w-4" />Scraped Incidents</button>
        <button onClick={() => setTab("rejected")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "rejected" ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground"}`}><SlidersHorizontal className="h-4 w-4" />Rejected Articles</button>
        {tab === "rejected" && <Select value={filters.reason} onChange={value => updateFilter("reason", value)}>{REJECTION_REASONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>}
      </div>

      <div className="space-y-3">
        {tab === "records"
          ? visibleRecords.map(record => <RecordCard key={record.id} record={record} records={records} onRefresh={load} />)
          : visibleCandidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} />)}
        {!loading && tab === "records" && !visibleRecords.length && <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No scraper records match the filters.</div>}
        {!loading && tab === "rejected" && !visibleCandidates.length && <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No rejected article candidates match the filters.</div>}
      </div>
    </div>
  );
}
