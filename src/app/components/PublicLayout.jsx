import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { Siren, Menu, X, MapPin, List, Home, AlertTriangle, PhoneCall, Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAccessibility } from '../contexts/AccessibilityContext';
import AccessibilityPanel, { AccessibilityButton } from './AccessibilityPanel';

export default function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { currentZoom, togglePanel } = useAccessibility();

  // Alt+A global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        togglePanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  return (
    <div
      className="min-h-screen bg-background transition-colors duration-300"
      style={{
        fontFamily: 'Inter, sans-serif',
        zoom: currentZoom,
        transformOrigin: 'top left',
      }}
    >
      {/* Top Navigation */}
      <header className="sticky top-0 z-[1000] bg-card border-b border-border shadow-sm transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/public')}>
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <Siren className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                ALERT-CIA
              </div>
              <div className="text-[10px] text-muted-foreground">Public Safety Monitor</div>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink
              to="/public"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground hover:bg-secondary'
                }`
              }
            >
              <Home className="w-4 h-4" />
              Dashboard
            </NavLink>
            <NavLink
              to="/public/incidents"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground hover:bg-secondary'
                }`
              }
            >
              <List className="w-4 h-4" />
              Incidents
            </NavLink>
            <NavLink
              to="/public/map"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground hover:bg-secondary'
                }`
              }
            >
              <MapPin className="w-4 h-4" />
              Live Map
            </NavLink>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Accessibility Button */}
            <AccessibilityButton />

            {/* Divider */}
            <div className="w-px h-5 bg-border hidden md:block" />

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Emergency Hotline */}
            <a
              href="tel:911"
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
            >
              <PhoneCall className="w-4 h-4" />
              Call 911
            </a>
            <button
              onClick={() => navigate('/login')}
              className="hidden md:block text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-secondary transition-all"
            >
              Staff Login
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-all"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card py-3 px-4 space-y-1 transition-colors duration-300">
            <NavLink
              to="/public"
              end
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground'
                }`
              }
            >
              <Home className="w-4 h-4" /> Dashboard
            </NavLink>
            <NavLink
              to="/public/incidents"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground'
                }`
              }
            >
              <List className="w-4 h-4" /> Incidents
            </NavLink>
            <NavLink
              to="/public/map"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'text-muted-foreground'
                }`
              }
            >
              <MapPin className="w-4 h-4" /> Live Map
            </NavLink>
            <a
              href="tel:911"
              className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg text-sm font-semibold"
            >
              <PhoneCall className="w-4 h-4" /> Emergency: Call 911
            </a>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="relative z-0">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-secondary border-t border-border text-muted-foreground py-6 mt-8 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center">
              <Siren className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm">ALERT-CIA © 2024 MDRRMO Echague. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>Emergency Hotline: <strong className="text-foreground">911</strong> | Echague, Isabela</span>
          </div>
        </div>
      </footer>

      {/* Accessibility Panel — portalled to document.body, unaffected by zoom */}
      <AccessibilityPanel />
    </div>
  );
}
