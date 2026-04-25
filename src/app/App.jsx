import { RouterProvider } from 'react-router-dom';
import { router } from './router';

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AccessibilityProvider } from './contexts/AccessibilityContext';

import { Toaster } from 'sonner';

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
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <NotificationProvider>
          <RouterProvider router={router} />
          <ToasterWrapper />
        </NotificationProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}