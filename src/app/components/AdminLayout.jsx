import { useState } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router";
import {
  LayoutDashboard, Map, AlertTriangle, FileText, BarChart2,
  Users, Settings, Bell, Menu, X, LogOut, ChevronRight,
  Shield, Radio, Activity, Ambulance, Moon, Sun, ClipboardCheck
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useNotifications } from "../contexts/NotificationContext";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Map Monitoring", icon: Map, path: "/map" },
  { label: "Incidents", icon: AlertTriangle, path: "/incidents" },
  { label: "PCR Report", icon: FileText, path: "/pcr" },
  { label: "PCR Verification", icon: ClipboardCheck, path: "/pcr-verification", badge: true },
  { label: "Analytics", icon: BarChart2, path: "/analytics" },
  { label: "User Management", icon: Users, path: "/users" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { notifications, unreadCount, markAsRead } = useNotifications();

  const currentPage = navItems.find(n => location.pathname.startsWith(n.path))?.label || "Dashboard";

  return (
    <div className="flex h-screen bg-background overflow-hidden transition-colors duration-300">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 h-full flex flex-col bg-[#0a1628] text-white
          transition-all duration-300 ease-in-out
          ${mobileSidebarOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"}
          ${sidebarOpen ? "md:w-64" : "md:w-16"}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10 min-h-16">
          <div className="shrink-0 w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          {(sidebarOpen || mobileSidebarOpen) && (
            <div className="overflow-hidden">
              <p className="text-white font-bold text-sm leading-tight">ALERT-CIA</p>
              <p className="text-slate-400 text-[10px] leading-tight">Emergency Response System</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto hidden md:block text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight size={16} className={`transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Status Indicator */}
        {(sidebarOpen || mobileSidebarOpen) && (
          <div className="mx-3 my-3 px-3 py-2 bg-green-900/30 border border-green-500/30 rounded-lg flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
            <span className="text-green-400 text-xs">System Online • Live</span>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const pendingPCRCount = item.badge ? notifications.filter(n => n.type === 'pcr_submitted' && !n.read).length : 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative
                  ${isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <item.icon size={18} className="shrink-0" />
                {(sidebarOpen || mobileSidebarOpen) && (
                  <>
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.badge && pendingPCRCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">
                        {pendingPCRCount}
                      </span>
                    )}
                    {!item.badge && isActive && (
                      <span className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />
                    )}
                  </>
                )}
                {!sidebarOpen && !mobileSidebarOpen && (
                  <>
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                      {item.label}
                    </div>
                    {item.badge && pendingPCRCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingPCRCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Stats */}
        {(sidebarOpen || mobileSidebarOpen) && (
          <div className="mx-3 mb-3 p-3 bg-white/5 rounded-lg space-y-2">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Live Status</p>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-red-400 text-xs"><Activity size={12} />Active</span>
              <span className="text-white text-xs font-bold">4</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-400 text-xs"><Ambulance size={12} />Deployed</span>
              <span className="text-white text-xs font-bold">6</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400 text-xs"><Radio size={12} />Online</span>
              <span className="text-white text-xs font-bold">12</span>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 mx-2 mb-3 px-3 py-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
        >
          <LogOut size={18} className="shrink-0" />
          {(sidebarOpen || mobileSidebarOpen) && <span className="text-sm">Logout</span>}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-4 px-4 md:px-6 py-3 bg-card border-b border-border z-30 min-h-16 transition-colors duration-300">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden text-muted-foreground hover:text-foreground"
          >
            <Menu size={20} />
          </button>

          <div>
            <h1 className="text-foreground font-bold text-base leading-tight">{currentPage}</h1>
            <p className="text-muted-foreground text-xs">ALERT-CIA Command Center</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Live clock */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-muted-foreground text-xs font-mono">
                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl shadow-xl border border-border z-50 transition-colors duration-300">
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
                    <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                  </div>
                  <div className="divide-y divide-border max-h-96 overflow-y-auto">
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
                          className={`flex gap-3 p-3 hover:bg-secondary/50 cursor-pointer transition-colors ${!n.read ? 'bg-blue-500/10' : ''}`}
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.type === 'pcr_submitted' || n.type === 'pcr_verified' || n.type === 'pcr_rejected') {
                              navigate('/pcr-verification');
                              setNotifOpen(false);
                            }
                          }}
                        >
                          <span className={`w-2 h-2 ${typeColors[n.type] || 'bg-slate-500'} rounded-full mt-1.5 shrink-0`} />
                          <div className="flex-1">
                            <p className="text-foreground text-xs font-medium">{n.title}</p>
                            <p className="text-muted-foreground text-xs">{n.message}</p>
                            <p className="text-muted-foreground text-xs mt-0.5 opacity-70">
                              {new Date(n.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
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

            {/* User Avatar */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                MS
              </div>
              <div className="hidden md:block">
                <p className="text-foreground text-xs font-semibold">Maria Santos</p>
                <p className="text-muted-foreground text-[10px]">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}