import { useAuth } from '../contexts/AuthContext';
import { createInformationalRefresh } from '../utils/informationalRefresh';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Search } from 'lucide-react';
import { getReportsSummary, clearSupabaseRequestCache, supabase } from '../services/supabase';

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
function getPeriodLabels(summary) {
  if (summary === 'quarterly') return quarters;
  if (summary === 'annual') return annualPeriods;
  return months;
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
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [summary, setSummary] = useState('monthly');
  const [reportData, setReportData] = useState({ reportRows: [], spreadsheetRows: [], barangayTotals: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const periodLabels = useMemo(() => getPeriodLabels(summary), [summary]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getReportsSummary(summary, `${user?.id}:${user?.role}`);
        if (mounted) setReportData(data);

      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load report data.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    setReportData({ reportRows: [], spreadsheetRows: [], barangayTotals: [] });
    load();
    const scheduler = createInformationalRefresh(load, { invalidate: () => clearSupabaseRequestCache('analytics:') });
    const refresh = scheduler.markStale;
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
      scheduler.dispose();
      if (channel) supabase.removeChannel(channel);
    };
  }, [summary, user?.id, user?.role]);

  const reportRows = useMemo(() => [...reportData.reportRows].sort((a, b) => {
    const ai = reportCategories.indexOf(a.category), bi = reportCategories.indexOf(b.category);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.category.localeCompare(b.category);
  }), [reportData]);
  const spreadsheetRows = reportData.spreadsheetRows;
  const totalReportRows = rows => rows.reduce((sum, row) => sum + row.total, 0);

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
  const barangayTotals = reportData.barangayTotals;
  const barangaysAffected = barangayTotals.length;
  const categoryTotals = reportRows
    .map((row) => ({ name: row.category, count: row.total }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const commonType = categoryTotals[0]?.name || 'No records';
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
          <button disabled={loading || Boolean(error)} onClick={() => exportExcel(flattenSectionsForExport(filteredSpreadsheetSections), periodLabels, summary)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button disabled={loading || Boolean(error)} onClick={() => exportPdf(flattenSectionsForExport(filteredSpreadsheetSections), periodLabels, summary)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
          <button disabled={loading || Boolean(error)} onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-secondary">
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
