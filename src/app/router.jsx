import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/Layout'
import PublicLayout from './components/PublicLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard from './pages/Dashboard'
import PCRModule from './pages/PCRModule'
import PCRVerification from './pages/PCRVerification';
import IncidentList from './pages/IncidentList'
import IncidentDetails from './pages/IncidentDetails'
import MapMonitoring from './pages/MapMonitoring'
import Analytics from './pages/Analytics'
import UserManagement from './pages/UserManagement'
import SystemSettings from './pages/SystemSettings'
import PublicDashboard from './pages/public/PublicDashboard'
import PublicIncidentList from './pages/public/PublicIncidentList'
import PublicMap from './pages/public/PublicMap'

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/admin',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'incidents', element: <IncidentList /> },
      { path: 'incidents/:id', element: <IncidentDetails /> },
      { path: 'map', element: <MapMonitoring /> },
      { path: 'pcr', element: <PCRModule /> },
      { path: 'pcr-verification', element: <PCRVerification /> },
      { path: 'analytics', element: <Analytics /> },
      { path: 'users', element: <UserManagement /> },
      { path: 'settings', element: <SystemSettings /> },
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