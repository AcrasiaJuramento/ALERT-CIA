import { createContext } from 'react';

// Keep the context identity in a module that does not contain Fast Refresh
// component exports. Provider and consumers must always share this instance.
export const NotificationContext = createContext(null);
