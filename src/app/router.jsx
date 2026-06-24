import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PublicLayout from './components/PublicLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard from './pages/Dashboard'
import PCRModule from './pages/PCRModule'
import PCRReports from './pages/PCRReports'
import IncidentList from './pages/IncidentList'
import IncidentDetails from './pages/IncidentDetails'
import MapMonitoring from './pages/MapMonitoring'
import AdvisoryModule from './pages/AdvisoryModule'
import Analytics from './pages/Analytics'
import ReportsAnalytics from './pages/ReportsAnalytics'
import UserManagement from './pages/UserManagement'
import SystemSettings from './pages/SystemSettings'
import PublicDashboard from './pages/public/PublicDashboard'
import PublicIncidentList from './pages/public/PublicIncidentList'
import PublicMap from './pages/public/PublicMap'
import AccessDenied from './pages/AccessDenied'
import ProtectedRoute from './components/ProtectedRoute'
import { PERMISSIONS } from './access/rbac'

const protect = (permission, element) => <ProtectedRoute permission={permission}>{element}</ProtectedRoute>

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/admin',
    element: protect(null, <Layout />),
    children: [
      { index: true, element: protect(PERMISSIONS.VIEW_DASHBOARD, <Dashboard />) },
      { path: 'incidents', element: protect(PERMISSIONS.VIEW_INCIDENTS, <IncidentList />) },
      { path: 'incidents/:id', element: protect(PERMISSIONS.VIEW_INCIDENTS, <IncidentDetails />) },
      { path: 'map', element: protect(PERMISSIONS.VIEW_MAP, <MapMonitoring />) },
      { path: 'advisories', element: protect(PERMISSIONS.MANAGE_ADVISORIES, <AdvisoryModule />) },
      { path: 'pcr', element: protect(PERMISSIONS.VIEW_PCR_RECORDS, <PCRReports />) },
      { path: 'pcr/new', element: protect(PERMISSIONS.CREATE_PCR, <PCRModule />) },
      { path: 'pcr-verification', element: <Navigate to="/admin/pcr" replace /> },
      { path: 'analytics', element: protect(PERMISSIONS.VIEW_ANALYTICS, <Analytics />) },
      { path: 'reports-analytics', element: protect(PERMISSIONS.VIEW_ANALYTICS, <ReportsAnalytics />) },
      { path: 'users', element: protect(PERMISSIONS.MANAGE_USERS, <UserManagement />) },
      { path: 'settings', element: protect(PERMISSIONS.VIEW_SETTINGS, <SystemSettings />) },
      { path: 'access-denied', element: <AccessDenied /> },
    ],
  },
  {
    path: '/public',
    element: <PublicLayout />,
    children: [
      { index: true, element: <PublicDashboard /> },
      { path: 'incidents', element: <PublicIncidentList /> },
      { path: 'map', element: <PublicMap /> },
    ],
  },
])
