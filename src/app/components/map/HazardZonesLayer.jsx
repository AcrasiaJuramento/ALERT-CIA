import { Circle, Polygon, Popup } from 'react-leaflet';
import { getZoneLatLng } from '../../utils/mapData';

const zoneStyles = {
  accident_hotspot: { color: '#ef4444', fillColor: '#ef4444' },
  flood_risk: { color: '#0ea5e9', fillColor: '#0ea5e9' },
  fire_hazard: { color: '#f97316', fillColor: '#f97316' },
  default: { color: '#eab308', fillColor: '#eab308' },
};

export function HazardZonesLayer({ zones = [], enabled = true }) {
  if (!enabled) return null;

  return zones.map((zone, index) => {
    const style = zoneStyles[zone.type] || zoneStyles.default;

    if (Array.isArray(zone.path) && zone.path.length > 2) {
      return (
        <Polygon
          key={`${zone.label}-${index}`}
          positions={zone.path}
          pathOptions={{ ...style, fillOpacity: 0.14, weight: 2, dashArray: '6 6' }}
        >
          <Popup>{zone.label || 'Geofence'}</Popup>
        </Polygon>
      );
    }

    return (
      <Circle
        key={`${zone.label}-${index}`}
        center={getZoneLatLng(zone)}
        radius={Number(zone.radius ?? 40) * 18}
        pathOptions={{ ...style, fillOpacity: 0.12, weight: 2, dashArray: '6 6' }}
      >
        <Popup>{zone.label || 'Hazard zone'}</Popup>
      </Circle>
    );
  });
}
