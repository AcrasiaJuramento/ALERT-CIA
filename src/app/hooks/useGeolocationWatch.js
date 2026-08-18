import { useEffect, useRef, useState } from 'react';

export function geolocationErrorStatus(error) {
  if (error?.code === 1) return 'denied';
  if (error?.code === 3) return 'timeout';
  return 'unavailable';
}

export default function useGeolocationWatch() {
  const [position, setPosition] = useState(null);
  const geolocationWatchIdRef = useRef(null);
  const [status, setStatus] = useState(() => (
    typeof navigator !== 'undefined' && navigator.geolocation ? 'starting' : 'unsupported'
  ));

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    if (geolocationWatchIdRef.current !== null) return undefined;
    try {
      geolocationWatchIdRef.current = navigator.geolocation.watchPosition(
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
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    } catch (error) {
      queueMicrotask(() => setStatus(geolocationErrorStatus(error)));
    }

    return () => {
      if (geolocationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchIdRef.current);
        geolocationWatchIdRef.current = null;
      }
    };
  }, []);

  return { position, status };
}
