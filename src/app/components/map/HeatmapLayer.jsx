import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { getHeatPoint } from '../../utils/mapData';

export function HeatmapLayer({ points = [], enabled = true }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !points.length || !L.heatLayer) return undefined;

    const heatLayer = L.heatLayer(points.map(getHeatPoint), {
      radius: 34,
      blur: 24,
      maxZoom: 17,
      minOpacity: 0.25,
      gradient: {
        0.25: '#22c55e',
        0.5: '#eab308',
        0.75: '#f97316',
        1: '#dc2626',
      },
    });

    heatLayer.addTo(map);
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [enabled, map, points]);

  return null;
}
