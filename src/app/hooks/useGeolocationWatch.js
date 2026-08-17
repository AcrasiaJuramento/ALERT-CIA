import { useEffect, useState } from 'react';

export function geolocationErrorStatus(error) {
  if (error?.code === 1) return 'denied';
  if (error?.code === 3) return 'timeout';
  return 'unavailable';
}

export default function useGeolocationWatch() {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState(() => (
    typeof navigator !== 'undefined' && navigator.geolocation ? 'starting' : 'unsupported'
  ));

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    let watchId;
    try {
      watchId = navigator.geolocation.watchPosition(
        nextPosition => {
          const { latitude, longitude, accuracy } = nextPosition.coords || {};
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            setStatus('unavailable');
            return;
          }
          setPosition(nextPosition);
          setStatus(Number.isFinite(accuracy) && accuracy > 150
            ? 'weak'
            : navigator.onLine ? 'active' : 'offline');
        },
        error => setStatus(geolocationErrorStatus(error)),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch (error) {
      queueMicrotask(() => setStatus(geolocationErrorStatus(error)));
    }

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return { position, status };
}
