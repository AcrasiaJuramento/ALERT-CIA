import {
  AlertTriangle,
  BarChart2,
  BellRing,
  FileSpreadsheet,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Map,
  Radio as RadioIcon,
  Settings,
  Users,
} from 'lucide-react';

export const ROLES = {
  ADMINISTRATOR: 'administrator',
  DISPATCHER: 'dispatcher',
  FIELD_OFFICER: 'field_responder',
};

export const ROLE_LABELS = {
  [ROLES.ADMINISTRATOR]: 'Administrator',
  [ROLES.DISPATCHER]: 'Dispatcher Officer',
  [ROLES.FIELD_OFFICER]: 'Field Officer',
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'dashboard:view',
  VIEW_INCIDENTS: 'incidents:view',
  VIEW_MAP: 'map:view',
  VIEW_PCR_RECORDS: 'pcr:view',
  CREATE_PCR: 'pcr:create',
  REVIEW_PCR: 'pcr:review',
  VIEW_RECEIVED_DISPATCHES: 'dispatch:received',
  VIEW_ANALYTICS: 'analytics:view',
  MANAGE_ADVISORIES: 'advisories:manage',
  MANAGE_USERS: 'users:manage',
  VIEW_SETTINGS: 'settings:view',
  VIEW_DISPATCH: 'dispatch:view',
  CREATE_DISPATCH: 'dispatch:create',
};

export const ROLE_PERMISSIONS = {
  [ROLES.FIELD_OFFICER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INCIDENTS,
    PERMISSIONS.VIEW_MAP,
    PERMISSIONS.VIEW_PCR_RECORDS,
    PERMISSIONS.CREATE_PCR,
    PERMISSIONS.VIEW_RECEIVED_DISPATCHES,
    PERMISSIONS.VIEW_SETTINGS,
  ],
  [ROLES.DISPATCHER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INCIDENTS,
    PERMISSIONS.VIEW_MAP,
    PERMISSIONS.VIEW_PCR_RECORDS,
    PERMISSIONS.REVIEW_PCR,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.VIEW_DISPATCH,
    PERMISSIONS.CREATE_DISPATCH,
  ],
  [ROLES.ADMINISTRATOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INCIDENTS,
    PERMISSIONS.VIEW_MAP,
    PERMISSIONS.VIEW_PCR_RECORDS,
    PERMISSIONS.REVIEW_PCR,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_ADVISORIES,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.VIEW_DISPATCH,
    PERMISSIONS.CREATE_DISPATCH,
  ],
};

export const NAVIGATION_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin', permission: PERMISSIONS.VIEW_DASHBOARD },
  { label: 'Incidents', icon: AlertTriangle, path: '/admin/incidents', permission: PERMISSIONS.VIEW_INCIDENTS },
  { label: 'Map Monitor', icon: Map, path: '/admin/map', permission: PERMISSIONS.VIEW_MAP },
  { label: 'Advisories', icon: BellRing, path: '/admin/advisories', permission: PERMISSIONS.MANAGE_ADVISORIES },
  { label: 'Patient Care Records', icon: FileText, path: '/admin/pcr', permission: PERMISSIONS.VIEW_PCR_RECORDS, group: 'Patient Care' },
  { label: 'Received Dispatches', icon: RadioIcon, path: '/admin/dispatch/received', permission: PERMISSIONS.VIEW_RECEIVED_DISPATCHES, group: 'Patient Care' },
  { label: 'Analytics', icon: BarChart2, path: '/admin/analytics', permission: PERMISSIONS.VIEW_ANALYTICS },
  { label: 'Spreadsheets Report', icon: FileSpreadsheet, path: '/admin/reports-analytics', permission: PERMISSIONS.VIEW_ANALYTICS },
  { label: 'User Management', icon: Users, path: '/admin/users', permission: PERMISSIONS.MANAGE_USERS },
  { label: 'Dispatch Form Records', icon: FileText, path: '/admin/dispatch', permission: PERMISSIONS.VIEW_DISPATCH, group: 'Dispatch' },
  { label: 'Create Dispatch Form', icon: FilePlus2, path: '/admin/dispatch/new', permission: PERMISSIONS.CREATE_DISPATCH, group: 'Dispatch' },
  { label: 'Settings', icon: Settings, path: '/admin/settings', permission: PERMISSIONS.VIEW_SETTINGS },
];

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getAuthorizedNavigation(role) {
  return NAVIGATION_ITEMS.filter(item => hasPermission(role, item.permission));
}

export function isNavigationItemActive(pathname, itemPath) {
  if (itemPath === '/admin') return pathname === itemPath;
  if (itemPath === '/admin/incidents') return pathname.startsWith('/admin/incidents');
  return pathname === itemPath;
}

export function getCurrentPage(pathname) {
  return NAVIGATION_ITEMS.find(item => isNavigationItemActive(pathname, item.path));
}
