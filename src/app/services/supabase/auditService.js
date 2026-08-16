import { runSupabaseRequest } from './errors';
import { getSupabaseClient } from '../../lib/supabaseClient';

export const AUDIT_PAGE_SIZE = 20;

export async function listAuditLogs({
  responseId,
  tableName,
  search = '',
  startDate = '',
  endDate = '',
  userId = '',
  role = '',
  module = '',
  action = '',
  platform = '',
  status = '',
  page = 1,
  pageSize = AUDIT_PAGE_SIZE,
  limit,
} = {}) {
  return runSupabaseRequest(async client => {
    const size = limit || pageSize;
    const from = limit ? 0 : Math.max(0, (page - 1) * size);
    let query = client
      .from('audit_logs')
      .select('*, actor:profiles(id, display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + size - 1);
    if (responseId) query = query.eq('response_id', responseId);
    if (tableName) query = query.eq('table_name', tableName);
    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59.999`);
    if (userId) query = query.eq('actor_profile_id', userId);
    if (role) query = query.eq('actor_role', role);
    if (module) query = query.eq('module', module);
    if (action) query = query.eq('action_name', action);
    if (platform) query = query.eq('platform', platform);
    if (status) query = query.eq('status', status);
    if (search.trim()) {
      const term = search.trim().replace(/[%(),]/g, ' ');
      query = query.or(`description.ilike.%${term}%,action_name.ilike.%${term}%,record_reference.ilike.%${term}%,actor_name.ilike.%${term}%`);
    }
    const result = await query;
    if (result.error) return result;
    return { data: limit ? (result.data || []) : { rows: result.data || [], count: result.count || 0 }, error: null };
  }, 'Unable to load audit logs. Administrator access is required.');
}

export async function getAuditLogSummary() {
  return runSupabaseRequest(client => client.rpc('get_audit_log_summary'), 'Unable to load audit summary.');
}

export async function logAuditEvent({ action, module = 'SYSTEM', recordReference, description, platform = 'Web', status = 'success', metadata = {}, requestId } = {}) {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('log_audit_event', {
      p_action_name: action,
      p_module: module,
      p_record_reference: recordReference || null,
      p_description: description || null,
      p_platform: platform,
      p_status: status,
      p_metadata: metadata,
      p_request_id: requestId || null,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('[audit] Non-blocking audit event failed.', error?.message || error);
    return null;
  }
}

export async function createDataExport(exportRequest) {
  return runSupabaseRequest(client => client.from('data_exports').insert({
    export_type: exportRequest.exportType,
    storage_path: exportRequest.storagePath || null,
    filters: exportRequest.filters || {},
    status: exportRequest.status || 'pending',
  }).select('*').single(), 'Unable to create data export record.');
}
