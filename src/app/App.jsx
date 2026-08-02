import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { router } from './router';

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { AuthProvider } from './contexts/AuthContext';
import OfflineSetupWizard from './components/OfflineSetupWizard';
import LocalServerRedirect from './components/LocalServerRedirect';

import { Toaster } from 'sonner';
import { startConnectionManager } from './network/connection-manager';
import { scheduleSyncTriggers } from './sync/sync-engine';
import { startOfflineSettingsCapture } from './pwa/offline-settings';

// Wrap toaster so it reacts to theme
function ToasterWrapper() {
  const { isDarkMode } = useTheme();

  return (
    <Toaster
      position="top-right"
      richColors
      theme={isDarkMode ? 'dark' : 'light'}
    />
  );
}

export default function App() {
  useEffect(() => {
    const stopOfflineSettingsCapture = startOfflineSettingsCapture();
    const stopConnectionManager = startConnectionManager();
    const stopSyncTriggers = scheduleSyncTriggers();
    return () => {
      stopOfflineSettingsCapture?.();
      stopConnectionManager?.();
      stopSyncTriggers?.();
    };
  }, []);

  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <AuthProvider>
          <NotificationProvider>
            <RouterProvider router={router} />
            <LocalServerRedirect />
            <OfflineSetupWizard />
            <ToasterWrapper />
          </NotificationProvider>
        </AuthProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}
