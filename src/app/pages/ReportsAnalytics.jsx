import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Search } from 'lucide-react';
import { listDispatchRecords, listIncidents, listPCRReports, supabase } from '../services/supabase';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
const annualPeriods = ['Annual'];
const reportCategories = [
  'Medical',
  'Trauma',
  'Conduction',
  'Motor Vehicle Crash',
  'Vehicle Type',
  'Person Involved',
  'Engine Size',
  'License',
  'Helmet',
  'Alcohol',
];
const spreadsheetSections = [
  { title: 'CONDUCTION', filter: 'Conduction', rows: ['Dialysis', 'Check-up', 'Travel (Within Region 2)', 'Travel (Outside Region 2)'] },
  { title: 'MEDICAL', filter: 'Medical', rows: ['Pediatric', 'Psychiatric', 'Surgical', 'Obstetrical', 'Drowning', 'Medical'] },
  { title: 'TRAUMA', filter: 'Trauma', rows: ['Fall', 'Electrocution', 'Domestic Violence', 'Fire Rescue Incident', 'Assault', 'Animal Bite', 'Trauma'] },
  { title: 'MOTOR VEHICLE CRASH TYPE', filter: 'Motor Vehicle Crash', rows: ['Collision', 'Self-Accident'] },
  { title: 'VEHICLE TYPE', filter: 'Vehicle Type', rows: ['Bicycle', 'Tricycle', 'Single Motor', 'Private Vehicle', 'Public Utility Vehicle', 'Truck', 'Other'] },
  { title: 'PERSON INVOLVED', filter: 'Person Involved', rows: ['Driver', 'Passenger', 'Pedestrian'] },
  { title: 'ENGINE SIZE', filter: 'Engine Size', rows: ['>4500', '<4500'] },
  { title: 'LICENSE', filter: 'License', rows: ['License (+)', 'License (-)'] },
  { title: 'HELMET', filter: 'Helmet', rows: ['Helmet (+)', 'Helmet (-)'] },
  { title: 'ALCOHOL', filter: 'Alcohol', rows: ['Alcohol (+)', 'Alcohol (-)'] },
];

function normalizeCategory(value) {
  const category = String(value || 'other').trim().toLowerCase();
  if (category === 'mvc' || category === 'vehicular' || category === 'motor vehicle crash type') return 'Motor Vehicle Crash';
  if (category === 'drivers license' || category === "driver's license") return 'License';
  if (category === 'alcohol breath' || category === 'alcohol involvement') return 'Alcohol';
  return category
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function textIncludesAny(value, terms) {
  const token = normalizeToken(value);
  return terms.some(term => token.includes(normalizeToken(term)));
}

function truthyCrashValue(value) {
  const token = normalizeToken(value);
  return ['yes', 'positive', 'worn', 'with', 'licensed', 'license positive', '+'].some(term => token === normalizeToken(term) || token.includes(normalizeToken(term)));
}

function falsyCrashValue(value) {
  const token = normalizeToken(value);
  return ['no', 'negative', 'none', 'not worn', 'without', 'unlicensed', 'not applicable', 'n a', '-'].some(term => token === normalizeToken(term) || token.includes(normalizeToken(term)));
}

function recordDate(record = {}) {
  return record.dateOfIncident || record.date || record.incidentDate || record.submittedAt || record.completedAt || record.createdAt || record.updatedAt;
}

function recordTerms(record = {}) {
  return [
    ...(record.natureTypes || []),
    ...(record.emergencyTypes || []),
    ...(record.traumaTypes || []),
    record.typeOfIncident,
    record.incidentNature,
    record.natureOfCall,
    record.otherMedical,
    record.otherTrauma,
    record.otherNature,
    record.emergencyOther,
    record.chiefComplaint,
  ].filter(Boolean);
}

function hasRecordTerm(record, terms) {
  return recordTerms(record).some(value => textIncludesAny(value, terms));
}

function crashValue(record, keys = []) {
  const crash = record.crash || {};
  for (const key of keys) {
    const value = crash[key] ?? record[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function recordMatchesSection(record, section) {
  if (section.filter === 'Conduction') return hasRecordTerm(record, ['Conduction', 'Transport', 'Transfer', 'Dialysis', 'Check-up', 'Travel']);
  if (section.filter === 'Medical') return hasRecordTerm(record, ['Medical', 'Pediatric', 'Psychiatric', 'Surgical', 'Obstetrical', 'Drowning']);
  if (section.filter === 'Trauma') return hasRecordTerm(record, ['Trauma', 'Fall', 'Electrocution', 'Domestic Violence', 'Fire Rescue Incident', 'Assault', 'Animal Bite']);
  if (section.filter === 'Motor Vehicle Crash') return hasRecordTerm(record, ['Motor Vehicle Crash']) || Boolean(record.collision || record.selfAccident || record.vehicleInvolved || record.crash?.vehicle);
  return recordMatchesSection(record, { filter: 'Motor Vehicle Crash' });
}

function recordMatchesRow(record, rowLabel, section) {
  if (section.filter === 'Conduction') return hasRecordTerm(record, [rowLabel]);
  if (section.filter === 'Medical') return hasRecordTerm(record, [rowLabel]);
  if (section.filter === 'Trauma') return hasRecordTerm(record, [rowLabel]);
  if (section.filter === 'Motor Vehicle Crash') {
    if (rowLabel === 'Collision') return Boolean(record.collision) || truthyCrashValue(crashValue(record, ['collision']));
    if (rowLabel === 'Self-Accident') return Boolean(record.selfAccident) || truthyCrashValue(crashValue(record, ['selfAccident', 'selfAccidentStatus']));
  }
  if (section.filter === 'Vehicle Type') return textIncludesAny(crashValue(record, ['vehicle', 'vehicleType', 'vehicleInvolved', 'vehicleInvolve']) || record.vehicleInvolved, [rowLabel]);
  if (section.filter === 'Person Involved') return textIncludesAny(crashValue(record, ['personInvolved', 'person', 'role']), [rowLabel]);
  if (section.filter === 'Engine Size') {
    const engineSize = crashValue(record, ['engineSize', 'engine']);
    const number = Number(String(engineSize).replace(/[^\d.]/g, ''));
    if (rowLabel === '>4500') return Number.isFinite(number) && number > 4500;
    if (rowLabel === '<4500') return Number.isFinite(number) && number > 0 && number < 4500;
  }
  if (section.filter === 'License') {
    const license = crashValue(record, ['license', 'driversLicense', 'driverLicense']);
    return rowLabel.includes('(+)') ? truthyCrashValue(license) : falsyCrashValue(license);
  }
  if (section.filter === 'Helmet') {
    const helmet = crashValue(record, ['helmet']);
    return rowLabel.includes('(+)') ? truthyCrashValue(helmet) : falsyCrashValue(helmet);
  }
  if (section.filter === 'Alcohol') {
    const alcohol = crashValue(record, ['alcohol', 'alcoholBreath']);
    return rowLabel.includes('(+)') ? truthyCrashValue(alcohol) : falsyCrashValue(alcohol);
  }
  return false;
}

function getPeriodLabels(summary) {
  if (summary === 'quarterly') return quarters;
  if (summary === 'annual') return annualPeriods;
  return months;
}

function getPeriodIndex(dateValue, summary) {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  if (summary === 'annual') return 0;
  const month = date.getMonth();
  return summary === 'quarterly' ? Math.floor(month / 3) : month;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const encoder = new TextEncoder();
let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(({ path, content }) => {
    const nameBytes = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes,
    ]);
    localParts.push(localHeader, data);
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]));
    offset += localHeader.length + data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const endRecord = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralDirectory.length), u32(offset), u16(0),
  ]);
  return concatBytes([...localParts, centralDirectory, endRecord]);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function columnName(index) {
  let name = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function exportExcel(rows, labels, summary) {
  const header = ['Category', ...labels, 'Total'];
  const tableRows = [header, ...rows.map((row) => [row.category, ...row.values, row.total])];
  const sheetData = tableRows.map((row, rowIndex) => (
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return typeof cell === 'number'
        ? `<c r="${ref}"><v>${cell}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join('')}</row>`
  )).join('');

  const files = [
    {
      path: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      path: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Spreadsheets Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`,
    },
  ];
  downloadBlob(`spreadsheets-report-${summary}.xlsx`, new Blob([createZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

function exportPdf(rows, labels, summary) {
  import('jspdf').then(({ jsPDF }) => {
    const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setFontSize(14);
    pdf.text(`Spreadsheets Report - ${summary.charAt(0).toUpperCase() + summary.slice(1)}`, 14, 14);
    pdf.setFontSize(8);
    let y = 24;
    rows.slice(0, 26).forEach((row) => {
      const values = labels.map((label, index) => `${label}: ${row.values[index] || 0}`).join(' | ');
      pdf.text(`${row.category}: ${values} | Total ${row.total}`, 14, y);
      y += 6;
      if (y > 190) {
        pdf.addPage();
        y = 18;
      }
    });
    pdf.save('spreadsheets-report.pdf');
  });
}

function flattenSectionsForExport(sections) {
  return sections.flatMap((section) => [
    { category: section.title, values: Array(section.rows[0]?.values.length || 12).fill(''), total: '' },
    ...section.rows,
  ]);
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

export default function ReportsAnalytics() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [summary, setSummary] = useState('monthly');
  const [incidents, setIncidents] = useState([]);
  const [dispatchRecords, setDispatchRecords] = useState([]);
  const [pcrReports, setPcrReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const periodLabels = useMemo(() => getPeriodLabels(summary), [summary]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [incidentRows, dispatchRows, pcrRows] = await Promise.all([
          listIncidents({ limit: 1000 }),
          listDispatchRecords({ limit: 1000 }),
          listPCRReports({ limit: 1000 }),
        ]);
        if (mounted) {
          setIncidents(incidentRows);
          setDispatchRecords(dispatchRows);
          setPcrReports(pcrRows);
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load report data.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const refresh = () => load();
    const interval = window.setInterval(refresh, 30000);
    const channel = supabase
      ?.channel?.('reports-analytics-live-counts')
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_forms' }, refresh)
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_patients' }, refresh)
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'pcr_reports' }, refresh)
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, refresh)
      ?.on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, refresh)
      ?.subscribe?.();
    return () => {
      mounted = false;
      window.clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const spreadsheetSourceRecords = useMemo(() => {
    const byResponse = new Map();
    dispatchRecords.forEach(record => {
      const key = record.responseId || record.id || record.dispatchId;
      if (key) byResponse.set(key, { ...record, sourceKinds: ['dispatch'] });
    });
    pcrReports.forEach(record => {
      const key = record.responseId || record.dispatchId || record.id;
      if (!key) return;
      const existing = byResponse.get(key) || {};
      byResponse.set(key, {
        ...existing,
        ...record,
        crash: { ...(existing.crash || {}), ...(record.crash || {}) },
        natureTypes: [...new Set([...(existing.natureTypes || []), ...(record.natureTypes || [])])],
        emergencyTypes: [...new Set([...(existing.emergencyTypes || []), ...(record.emergencyTypes || [])])],
        traumaTypes: [...new Set([...(existing.traumaTypes || []), ...(record.traumaTypes || [])])],
        sourceKinds: [...new Set([...(existing.sourceKinds || []), 'pcr'])],
      });
    });
    return [...byResponse.values()];
  }, [dispatchRecords, pcrReports]);

  const reportRows = useMemo(() => {
    const byCategory = {};

    incidents.forEach((incident) => {
      const label = normalizeCategory(incident.classification || incident.type);
      if (!byCategory[label]) byCategory[label] = Array(periodLabels.length).fill(0);
      const index = getPeriodIndex(incident.date, summary);
      if (index !== null && index >= 0 && index < periodLabels.length) byCategory[label][index] += 1;
    });

    return Object.entries(byCategory)
      .map(([category, values]) => ({ category, values, total: values.reduce((sum, value) => sum + value, 0) }))
      .sort((a, b) => {
        const orderA = reportCategories.indexOf(a.category);
        const orderB = reportCategories.indexOf(b.category);
        if (orderA !== -1 || orderB !== -1) return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
        return a.category.localeCompare(b.category);
      });
  }, [incidents, periodLabels.length, summary]);

  const spreadsheetRows = useMemo(() => spreadsheetSections.map((section) => {
    const rows = section.rows.map((rowLabel) => {
      const values = Array(periodLabels.length).fill(0);
      spreadsheetSourceRecords.forEach((record) => {
        if (!recordMatchesSection(record, section)) return;
        if (!recordMatchesRow(record, rowLabel, section)) return;
        const index = getPeriodIndex(recordDate(record), summary);
        if (index !== null && index >= 0 && index < periodLabels.length) values[index] += 1;
      });
      return {
        category: rowLabel,
        values,
        total: values.reduce((sum, value) => sum + value, 0),
      };
    });
    return {
      ...section,
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }), [periodLabels.length, spreadsheetSourceRecords, summary]);

  const totalReportRows = rows => rows.reduce((sum, row) => sum + row.total, 0);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reportRows.filter((row) => {
      const matchesCategory = categoryFilter === 'All Categories' || row.category === categoryFilter;
      const matchesSearch = !term || row.category.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, reportRows, search]);

  const filteredSpreadsheetSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    return spreadsheetRows
      .filter((section) => categoryFilter === 'All Categories' || section.filter === categoryFilter)
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => !term || row.category.toLowerCase().includes(term) || section.title.toLowerCase().includes(term)),
      }))
      .filter((section) => section.rows.length > 0);
  }, [categoryFilter, search, spreadsheetRows]);

  const visibleSpreadsheetRows = filteredSpreadsheetSections.flatMap((section) => section.rows);

  const medicalTotal = reportRows.find((row) => row.category === 'Medical')?.total || 0;
  const traumaTotal = reportRows.find((row) => row.category === 'Trauma')?.total || 0;
  const mvcTotal = reportRows.find((row) => row.category === 'Motor Vehicle Crash')?.total || 0;
  const grandTotal = totalReportRows(reportRows);
  const getIncidentBarangay = (incident) => incident.barangay || incident.location_barangay || incident.address_barangay;
  const barangaysAffected = new Set(incidents.map(getIncidentBarangay).filter(Boolean)).size;
  const categoryTotals = reportRows
    .map((row) => ({ name: row.category, count: row.total }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const commonType = categoryTotals[0]?.name || 'No records';
  const barangayTotals = Object.entries(incidents.reduce((acc, incident) => {
    const barangay = getIncidentBarangay(incident);
    if (barangay) acc[barangay] = (acc[barangay] || 0) + 1;
    return acc;
  }, {}))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const topBarangay = barangayTotals[0]?.name || 'No records';
  const periodTotals = periodLabels.map((label, index) => ({
    label,
    count: reportRows.reduce((sum, row) => sum + row.values[index], 0),
  }));
  const peakPeriod = periodTotals.reduce((top, item) => (item.count > top.count ? item : top), periodTotals[0] || { label: 'No records', count: 0 });
  const peakPeriodLabel = peakPeriod.count > 0 ? peakPeriod.label : 'No records';
  const peakLabel = summary === 'monthly' ? 'Peak Month' : summary === 'quarterly' ? 'Peak Quarter' : 'Annual Total';
  const peakValue = summary === 'annual' ? grandTotal : peakPeriodLabel;

  return (
    <div className="min-h-full space-y-5 bg-background p-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Spreadsheets Report
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Spreadsheet-style statistical reports for DOH, MDRRMO, EMS, and incident monitoring</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5 text-xs">
            {['monthly', 'quarterly', 'annual'].map((item) => (
              <button
                key={item}
                onClick={() => setSummary(item)}
                className={`px-3 py-2 capitalize rounded-md ${summary === item ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <button onClick={() => exportExcel(flattenSectionsForExport(filteredSpreadsheetSections), periodLabels, summary)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button onClick={() => exportPdf(flattenSectionsForExport(filteredSpreadsheetSections), periodLabels, summary)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total Incidents" value={grandTotal} />
        <StatCard label="Medical Cases" value={medicalTotal} />
        <StatCard label="Trauma Cases" value={traumaTotal} />
        <StatCard label="MVC Cases" value={mvcTotal} />
        <StatCard label="Barangays Affected" value={barangaysAffected} />
        <StatCard label="Common Type" value={commonType} />
        <StatCard label="Top Barangay" value={topBarangay} />
        <StatCard label={peakLabel} value={peakValue} />
      </div>
      {loading && <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading report data...</div>}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Interactive Statistical Table</h2>
            <p className="text-xs text-muted-foreground">Auto-computed {summary} totals, row totals, and grand totals</p>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row">
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search category"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none focus:border-blue-500"
            />
          </div>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-blue-500 lg:w-52"
            >
              <option>All Categories</option>
              {reportCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1120px] text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
                <th className="sticky left-0 z-10 bg-secondary px-4 py-3 text-left font-medium">Category</th>
                {periodLabels.map((label) => <th key={label} className="px-3 py-3 text-center font-medium">{summary === 'monthly' ? label.slice(0, 3) : label}</th>)}
                <th className="px-4 py-3 text-right font-semibold text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpreadsheetSections.map((section) => (
                <Fragment key={section.title}>
                  <tr className="bg-blue-900 text-white">
                    <td colSpan={periodLabels.length + 2} className="px-4 py-2 text-center text-xs font-bold">{section.title}</td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={`${section.title}-${row.category}`} className="border-b border-border/60 bg-white text-black hover:bg-slate-50">
                      <td className="sticky left-0 bg-white px-4 py-2 text-center font-medium text-black">{row.category}</td>
                      {row.values.map((value, index) => <td key={periodLabels[index]} className="px-3 py-2 text-center text-black">{value}</td>)}
                      <td className="px-4 py-2 text-center font-semibold text-black">{row.total}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-black">
                <td className="sticky left-0 bg-slate-100 px-4 py-3 text-center">GRAND TOTAL</td>
                {periodLabels.map((label, index) => (
                  <td key={label} className="px-3 py-3 text-center">{visibleSpreadsheetRows.reduce((sum, row) => sum + row.values[index], 0)}</td>
                ))}
                <td className="px-4 py-3 text-center">{totalReportRows(visibleSpreadsheetRows)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
