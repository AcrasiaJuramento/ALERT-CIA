import { Polyline, Popup } from 'react-leaflet';

export function RouteLayer({ routes = [] }) {
  return routes.map((route, index) => {
    const positions = route.positions || route.waypoints;
    if (!Array.isArray(positions) || positions.length < 2) return null;

    return (
      <Polyline
        key={route.id || index}
        positions={positions}
        pathOptions={{
          color: route.color || '#2563eb',
          weight: route.weight || 5,
          opacity: route.opacity ?? 0.85,
        }}
      >
        <Popup>{route.label || 'Route'}</Popup>
      </Polyline>
    );
  });
}
