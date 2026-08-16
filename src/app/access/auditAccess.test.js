import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthorizedNavigation, hasPermission, PERMISSIONS, ROLES } from './rbac.js';

test('audit history permission is administrator-only', () => {
  assert.equal(hasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.VIEW_AUDIT_LOGS), true);
  assert.equal(hasPermission(ROLES.DISPATCHER, PERMISSIONS.VIEW_AUDIT_LOGS), false);
  assert.equal(hasPermission(ROLES.FIELD_OFFICER, PERMISSIONS.VIEW_AUDIT_LOGS), false);
});

test('audit sidebar entry is hidden from non-admin roles', () => {
  assert.equal(getAuthorizedNavigation(ROLES.ADMINISTRATOR).some(item => item.path === '/admin/audit-logs'), true);
  assert.equal(getAuthorizedNavigation(ROLES.DISPATCHER).some(item => item.path === '/admin/audit-logs'), false);
  assert.equal(getAuthorizedNavigation(ROLES.FIELD_OFFICER).some(item => item.path === '/admin/audit-logs'), false);
});
