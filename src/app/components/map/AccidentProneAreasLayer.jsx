import { Circle, Popup } from 'react-leaflet';
import { formatRiskLevel, riskStyles } from '../../utils/accidentProneAreas';
import { getAccidentProneAreaRadiusMeters } from '../../utils/accidentProneWarningZones';

function advisoryFor(area) {
  if (area.risk_level === 'Critical') {
    return 'Use extreme caution, slow down, and avoid unnecessary travel through this area when possible.';
  }
  if (area.risk_level === 'High') {
    return 'Please slow down and stay alert when passing through this area.';
  }
  return 'Stay alert and observe road safety reminders in this area.';
}

function AdminPopup({ area }) {
  return (
    <div className="min-w-56 text-xs">
      <div className="mb-1 text-sm font-bold">{area.barangay}</div>
      <div className="mb-2 font-semibold" style={{ color: riskStyles[area.risk_level]?.color }}>
        {formatRiskLevel(area.risk_level)} / Score {area.total_risk_score}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>Total MDRRMO incidents</span><strong>{area.mdrrmo_incident_count}</strong>
        <span>Verified scraped accidents</span><strong>{area.web_scraped_verified_count}</strong>
        <span>Common incident</span><strong>{area.most_common_incident_type}</strong>
        <span>Highest severity</span><strong>{area.highest_severity}</strong>
        <span>Latest incident</span><strong>{area.latest_incident_date || '-'}</strong>
        <span>Peak time</span><strong>{area.peak_time || '-'}</strong>
      </div>
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        Frequency {area.frequency_score} + Severity {area.severity_score} + Recency {area.recency_score} + Source {area.source_reliability_score}
      </div>
    </div>
  );
}

function PublicPopup({ area }) {
  const style = riskStyles[area.risk_level] || riskStyles.Low;
  return (
    <div className="min-w-52 text-xs">
      <div className="mb-1 text-sm font-bold">{style.publicLabel}</div>
      <div><strong>Area:</strong> {area.barangay}</div>
      <div><strong>Risk Level:</strong> {formatRiskLevel(area.risk_level)}</div>
      <div><strong>Common Incident:</strong> {area.most_common_incident_type}</div>
      <div><strong>Latest Verified Incident:</strong> {area.latest_incident_date || 'Recent verified record'}</div>
      <div className="mt-2 rounded border border-orange-200 bg-orange-50 p-2 text-[11px] text-orange-800">
        <strong>Safety Advisory:</strong> {advisoryFor(area)}
      </div>
    </div>
  );
}

export function AccidentProneAreasLayer({ areas = [], enabled = true, publicSafe = false, criticalOnly = false, excludeCritical = false }) {
  if (!enabled) return null;

  return areas
    .filter(area => !criticalOnly || area.risk_level === 'Critical')
    .filter(area => !excludeCritical || area.risk_level !== 'Critical')
    .map(area => {
      const style = riskStyles[area.risk_level] || riskStyles.Low;
      return (
        <Circle
          key={area.area_id}
          center={[Number(area.latitude), Number(area.longitude)]}
          radius={getAccidentProneAreaRadiusMeters(area)}
          pathOptions={{
            color: style.color,
            fillColor: style.color,
            fillOpacity: area.risk_level === 'Critical' ? 0.22 : 0.16,
            weight: area.risk_level === 'Critical' ? 3 : 2,
            dashArray: area.risk_level === 'Critical' ? undefined : '8 6',
          }}
        >
          <Popup>{publicSafe ? <PublicPopup area={area} /> : <AdminPopup area={area} />}</Popup>
        </Circle>
      );
    });
}

export default AccidentProneAreasLayer;
