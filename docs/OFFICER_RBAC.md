# Officer Navigation and RBAC

The frontend uses canonical Supabase role names from `src/app/access/rbac.js`. Sidebar visibility and route authorization use the same permission definitions.

## Permission Matrix

| Page | Field Officer (`field_responder`) | Dispatcher Officer (`dispatcher`) | Administrator (`administrator`) |
| --- | --- | --- | --- |
| Dashboard | Yes | Yes | Yes |
| Incidents | Yes | Yes | Yes |
| Map Monitor | Yes | Yes | Yes |
| Patient Care Records | Yes, own records | Yes, station records | Yes, all records |
| Create PCR Report | Yes | No | No |
| PCR Review & Verification | No | Yes | Yes |
| Analytics | No | Yes | Yes |
| User Management | No | No | Yes |
| Settings | Yes | Yes | Yes |

## Architecture

- `AuthContext.jsx` provides the current prototype session and canonical role.
- `rbac.js` is the single source of truth for permissions, labels, navigation, and active-route matching.
- `ProtectedRoute.jsx` blocks direct URL access and redirects unauthorized users to `/admin/access-denied`.
- `Layout.jsx` filters navigation from the permission matrix and derives one active item from `location.pathname`.
- `002_role_navigation_rbac.sql` aligns PCR creation, PCR review, audit-log access, and analytics RLS with the UI matrix.

When Supabase Auth is connected, replace the demo `login()` implementation with a profile and `profile_roles` query. Keep the returned role canonical and leave route/sidebar authorization unchanged. Frontend guards improve UX; Supabase RLS and workflow functions remain the security boundary.
