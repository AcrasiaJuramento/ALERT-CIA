import { createContext, useContext } from 'react';
import useGeolocationWatch from '../hooks/useGeolocationWatch';

const GeolocationContext = createContext(null);

export function GeolocationProvider({ children }) {
  const geolocation = useGeolocationWatch();
  return (
    <GeolocationContext.Provider value={geolocation}>
      {children}
    </GeolocationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGeolocation() {
  const context = useContext(GeolocationContext);
  if (!context) throw new Error('useGeolocation must be used within GeolocationProvider');
  return context;
}
