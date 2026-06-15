import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, ExternalLink, LogOut, Menu, Moon, Radio, Siren, Sun, X,
} from 'lucide-react';
import { getAuthorizedNavigation, getCurrentPage, isNavigationItemActive, PERMISSIONS } from '../access/rbac';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, roleLabel, can, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const navItems = getAuthorizedNavigation(user.role);
  const currentPage = getCurrentPage(location.pathname);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openPCRNotification = notification => {
    markAsRead(notification.id);
    navigate(can(PERMISSIONS.REVIEW_PCR) ? '/admin/pcr-verification' : '/admin/pcr');
    setNotifOpen(false);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {mobileSidebarOpen && <button aria-label="Close sidebar" className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      <aside className={`fixed md:relative z-50 h-full shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${mobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} ${sidebarOpen ? 'md:w-64' : 'md:w-16'}`}>
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border shrink-0">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shrink-0"><Siren className="w-5 h-5 text-white" /></div>
          {(sidebarOpen || mobileSidebarOpen) && <div className="ml-3"><div className="text-sm font-bold text-sidebar-foreground tracking-wide">ALERT-CIA</div><div className="text-[10px] text-sidebar-foreground/50">MDRRMO Command Center</div></div>}
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = isNavigationItemActive(location.pathname, item.path);
            const showGroup = item.group && navItems[index - 1]?.group !== item.group;
            const pendingPCRCount = item.badge ? notifications.filter(n => n.type === 'pcr_submitted' && !n.read).length : 0;
            return (
              <div key={item.path}>
                {showGroup && (sidebarOpen || mobileSidebarOpen) && <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40">{item.group}</div>}
                <Link
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  title={!sidebarOpen ? item.label : undefined}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative border ${isActive ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border-transparent'}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {(sidebarOpen || mobileSidebarOpen) && <span className="text-sm font-medium">{item.label}</span>}
                  {(sidebarOpen || mobileSidebarOpen) && pendingPCRCount > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingPCRCount}</span>}
                  {!sidebarOpen && !mobileSidebarOpen && pendingPCRCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full grid place-items-center">{pendingPCRCount}</span>}
                </Link>
              </div>
            );
          })}
          <div className="my-3 border-t border-sidebar-border" />
          <Link to="/public" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all">
            <ExternalLink className="w-5 h-5 shrink-0" />
            {(sidebarOpen || mobileSidebarOpen) && <span className="text-sm font-medium">Public View</span>}
          </Link>
        </nav>

        <button onClick={handleLogout} className="m-3 flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-all">
          <LogOut className="w-5 h-5 shrink-0" />
          {(sidebarOpen || mobileSidebarOpen) && <span className="text-sm font-medium">Logout</span>}
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
          <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden w-8 h-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary"><Menu className="w-4 h-4" /></button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden md:grid w-8 h-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">{sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}</button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{currentPage?.label ?? (location.pathname.includes('access-denied') ? 'Access Denied' : 'Command Center')}</h1>
            <div className="text-[10px] text-muted-foreground truncate">Command Center / {currentPage?.group ? `${currentPage.group} / ` : ''}{currentPage?.label ?? 'Restricted Page'}</div>
          </div>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg"><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-xs text-green-400 font-medium">SYSTEM ONLINE</span></div>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-red-600/10 border border-red-500/30 rounded-lg"><Radio className="w-3 h-3 text-red-400" /><span className="text-xs text-red-400 font-medium">8 ACTIVE INCIDENTS</span></div>
          <div className="flex-1" />
          <div className="hidden md:block text-right"><div className="text-sm font-mono text-foreground font-semibold">{currentTime.toLocaleTimeString('en-PH', { hour12: false })}</div><div className="text-[10px] text-muted-foreground">{currentTime.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
          <button onClick={toggleDarkMode} className="w-9 h-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary" title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>

          <div className="relative">
            <button onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); }} className="relative w-9 h-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary"><Bell className="w-5 h-5" />{unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}</button>
            {notifOpen && <div className="absolute right-0 top-11 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-xl z-60 overflow-hidden"><div className="px-4 py-3 border-b border-border font-semibold text-sm">Notifications</div><div className="max-h-96 overflow-y-auto">{notifications.slice(0, 10).map(n => <button key={n.id} onClick={() => openPCRNotification(n)} className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 ${!n.read ? 'bg-blue-500/5' : ''}`}><div className="text-xs text-foreground">{n.title}</div><div className="text-xs text-muted-foreground">{n.message}</div></button>)}</div></div>}
          </div>

          <div className="relative">
            <button onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary"><div className="w-8 h-8 bg-blue-600 rounded-full grid place-items-center text-xs font-bold text-white">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div className="hidden md:block text-left"><div className="text-xs font-semibold text-foreground">{user.name}</div><div className="text-[10px] text-muted-foreground">{roleLabel}</div></div><ChevronDown className="w-3 h-3 text-muted-foreground" /></button>
            {userMenuOpen && <div className="absolute right-0 top-11 w-52 bg-card border border-border rounded-xl shadow-xl z-60 overflow-hidden"><div className="px-4 py-3 border-b border-border"><div className="text-xs font-semibold">{user.name}</div><div className="text-[10px] text-muted-foreground">{user.email}</div></div><button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-secondary">Logout</button></div>}
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background"><Outlet /></main>
      </div>
    </div>
  );
}
