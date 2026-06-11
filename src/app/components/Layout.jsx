import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle, Map, FileText, BarChart2,
  Users, Settings, LogOut, Bell, ChevronDown, Menu, X,
  ExternalLink, Siren, Radio, Moon, Sun, ClipboardCheck, FilePlus2
} from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: AlertTriangle, label: 'Incidents', path: '/admin/incidents' },
  { icon: Map, label: 'Map Monitor', path: '/admin/map' },
  { icon: FileText, label: 'PCR Reports', path: '/admin/pcr' },
  { icon: FilePlus2, label: 'New PCR', path: '/admin/pcr/new' },
  { icon: ClipboardCheck, label: 'PCR Verification', path: '/admin/pcr-verification', badge: true },
  { icon: BarChart2, label: 'Analytics', path: '/admin/analytics' },
  { icon: Users, label: 'User Management', path: '/admin/users' },
  { icon: Settings, label: 'Settings', path: '/admin/settings' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  const { isDarkMode, toggleDarkMode } = useTheme();
  const { notifications, unreadCount, markAsRead } = useNotifications();

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  const formattedDate = currentTime.toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar */}
      <aside
        className={`shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'w-60' : 'w-16'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shrink-0">
              <Siren className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <div className="text-sm font-bold text-sidebar-foreground tracking-wide" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  ALERT-CIA
                </div>
                <div className="text-[10px] text-sidebar-foreground/50">MDRRMO Command Center</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, path, badge }) => {
            const pendingPCRCount = badge ? notifications.filter(n => n.type === 'pcr_submitted' && !n.read).length : 0;
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/admin'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="text-sm font-medium">{label}</span>
                    {badge && pendingPCRCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">
                        {pendingPCRCount}
                      </span>
                    )}
                  </>
                )}
                {!sidebarOpen && badge && pendingPCRCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {pendingPCRCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          <div className="my-3 border-t border-sidebar-border" />

          <NavLink
            to="/public"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all border border-transparent"
          >
            <ExternalLink className="w-5 h-5 shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Public View</span>}
          </NavLink>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-all w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-card border-b border-border flex items-center px-4 gap-4 shrink-0 transition-colors duration-300">
          {/* Toggle Sidebar */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* System Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">SYSTEM ONLINE</span>
          </div>

          {/* Active emergency badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 border border-red-500/30 rounded-lg">
            <Radio className="w-3 h-3 text-red-400 animate-pulse" />
            <span className="text-xs text-red-400 font-medium">8 ACTIVE INCIDENTS</span>
          </div>

          <div className="flex-1" />

          {/* Time Display */}
          <div className="hidden md:flex flex-col items-end">
            <div className="text-sm font-mono text-foreground font-semibold">{formattedTime}</div>
            <div className="text-[10px] text-muted-foreground">{formattedDate}</div>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); }}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden transition-colors duration-300">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.slice(0, 10).map((n) => {
                    const typeColors = {
                      pcr_submitted: 'bg-blue-500',
                      pcr_verified: 'bg-green-500',
                      pcr_rejected: 'bg-red-500',
                      info: 'bg-blue-500',
                      warning: 'bg-orange-500',
                      success: 'bg-green-500',
                      error: 'bg-red-500',
                    };
                    return (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-border/50 hover:bg-secondary/50 cursor-pointer transition-colors ${!n.read ? 'bg-blue-500/5' : ''}`}
                        onClick={() => {
                          markAsRead(n.id);
                          if (n.type === 'pcr_submitted' || n.type === 'pcr_verified' || n.type === 'pcr_rejected') {
                            navigate('/admin/pcr-verification');
                            setNotifOpen(false);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${typeColors[n.type] || 'bg-muted-foreground'}`} />
                          <div>
                            <div className="text-xs text-foreground">{n.title}</div>
                            <div className="text-xs text-muted-foreground">{n.message}</div>
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {new Date(n.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                      <p className="text-muted-foreground text-sm">No notifications</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-all"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">MS</div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold text-foreground">Admin Santos</div>
                <div className="text-[10px] text-muted-foreground">Administrator</div>
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-11 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden transition-colors duration-300">
                <div className="px-4 py-2 border-b border-border">
                  <div className="text-xs font-semibold text-foreground">Admin Maria Santos</div>
                  <div className="text-[10px] text-muted-foreground">admin.santos@mdrrmo.gov.ph</div>
                </div>
                <button className="w-full text-left px-4 py-2.5 text-xs text-foreground/80 hover:bg-secondary transition-colors">Profile Settings</button>
                <button className="w-full text-left px-4 py-2.5 text-xs text-foreground/80 hover:bg-secondary transition-colors">Change Password</button>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-secondary transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background transition-colors duration-300">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
