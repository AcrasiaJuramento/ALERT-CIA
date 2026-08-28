import { useEffect, useRef } from 'react';
import { Circle, Popup } from 'react-leaflet';
import { formatRiskLevel, riskStyles } from '../../utils/accidentProneAreas';
import { getAccidentProneAreaRadiusMeters } from '../../utils/accidentProneWarningZones';

function advisoryFor(area) {
  if (area.zone_type === 'news_caution_area') {
    return 'News reports indicate accident activity in this area. Slow down and stay alert while official records are reviewed.';
  }
  if (area.risk_level === 'Critical') {
    return 'Use extreme caution, slow down, and avoid unnecessary travel through this area when possible.';
  }
  if (area.risk_level === 'High') {
    return 'Please slow down and stay alert when passing through this area.';
  }
  return 'Stay alert and observe road safety reminders in this area.';
}

function AdminPopup({ area }) {
  const counts = area.severity_counts || {};
  const levelLabel = formatRiskLevel(area.risk_level);
  return (
    <div className="min-w-56 text-xs">
      <div className="mb-1 text-sm font-bold">{area.barangay}</div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{area.zone_label || 'Accident-Prone Area'}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>Pattern level</span><strong style={{ color: riskStyles[area.risk_level]?.color }}>{levelLabel}</strong>
        <span>Accidents</span><strong>{area.unique_incident_count ?? area.total_incidents}</strong>
        <span>Danger score</span><strong>{area.severity_burden ?? 0}</strong>
        <span>Black / Red</span><strong>{counts.critical || 0} / {counts.high || 0}</strong>
        <span>Yellow / Green</span><strong>{counts.moderate || 0} / {counts.low || 0}</strong>
        <span>Total MDRRMO incidents</span><strong>{area.mdrrmo_incident_count}</strong>
        <span>Verified scraped accidents</span><strong>{area.web_scraped_verified_count}</strong>
        <span>Common incident</span><strong>{area.most_common_incident_type}</strong>
        <span>Highest severity</span><strong>{area.highest_severity}</strong>
        <span>Latest incident</span><strong>{area.latest_incident_date || '-'}</strong>
        <span>Peak time</span><strong>{area.peak_time || '-'}</strong>
      </div>
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        Updated matrix: {area.unique_incident_count ?? 0} accidents + danger score {area.severity_burden ?? 0}
        {area.recent_advisory ? ` / ${area.recent_advisory}` : ''}
      </div>
      {area.is_provisional && <div className="mt-1 text-[10px] text-amber-700">{area.provisional_message}</div>}
    </div>
  );
}

function PublicPopup({ area }) {
  const style = riskStyles[area.risk_level] || riskStyles.Low;
  const publicLabel = area.zone_type === 'news_caution_area' ? 'News-Based Caution Area' : style.publicLabel;
  return (
    <div className="min-w-52 text-xs">
      <div className="mb-1 text-sm font-bold">{publicLabel}</div>
      <div><strong>Area:</strong> {area.barangay}</div>
      <div><strong>Pattern level:</strong> {formatRiskLevel(area.risk_level)}</div>
      <div><strong>Accidents:</strong> {area.unique_incident_count ?? area.total_incidents ?? 0}</div>
      <div><strong>Danger score:</strong> {area.severity_burden ?? 0}</div>
      {area.recent_advisory && <div><strong>Recent advisory:</strong> {area.recent_advisory}</div>}
      <div><strong>Common Incident:</strong> {area.most_common_incident_type}</div>
      <div><strong>Latest Verified Incident:</strong> {area.latest_incident_date || 'Recent verified record'}</div>
      <div className="mt-2 rounded border border-orange-200 bg-orange-50 p-2 text-[11px] text-orange-800">
        <strong>Safety Advisory:</strong> {advisoryFor(area)}
      </div>
      {area.is_provisional && <div className="mt-1 text-[10px] text-amber-700">{area.provisional_message}</div>}
    </div>
  );
}

function AccidentProneAreaCircle({ area, publicSafe, selected, onAreaClick, onMapClick }) {
  const circleRef = useRef(null);
  const style = riskStyles[area.risk_level] || riskStyles.Low;
  const isNewsCautionArea = area.zone_type === 'news_caution_area';

  useEffect(() => {
    if (selected) circleRef.current?.openPopup();
  }, [selected]);

  return (
    <Circle
      ref={circleRef}
      center={[Number(area.latitude), Number(area.longitude)]}
      radius={getAccidentProneAreaRadiusMeters(area)}
      eventHandlers={{
        click: (event) => {
          onAreaClick?.(area);
          onMapClick?.(event.latlng, event);
        },
      }}
      pathOptions={{
        color: selected ? '#f8fafc' : style.color,
        fillColor: style.color,
        fillOpacity: selected ? 0.34 : isNewsCautionArea ? 0.07 : area.risk_level === 'Critical' ? 0.22 : 0.16,
        opacity: isNewsCautionArea ? 0.72 : 1,
        weight: selected ? 5 : isNewsCautionArea ? 2 : area.risk_level === 'Critical' ? 3 : 2,
        dashArray: isNewsCautionArea ? '8 7' : undefined,
      }}
    >
      <Popup>{publicSafe ? <PublicPopup area={area} /> : <AdminPopup area={area} />}</Popup>
    </Circle>
  );
}

export function AccidentProneAreasLayer({
  areas = [],
  enabled = true,
  publicSafe = false,
  criticalOnly = false,
  excludeCritical = false,
  selectedAreaId,
  onAreaClick,
  onMapClick,
}) {
  if (!enabled) return null;

  return areas
    .filter(area => !criticalOnly || area.risk_level === 'Critical')
    .filter(area => !excludeCritical || area.risk_level !== 'Critical')
    .map(area => (
      <AccidentProneAreaCircle
        key={area.area_id}
        area={area}
        publicSafe={publicSafe}
        selected={selectedAreaId === area.area_id}
        onAreaClick={onAreaClick}
        onMapClick={onMapClick}
      />
    ));
}

export default AccidentProneAreasLayer;
