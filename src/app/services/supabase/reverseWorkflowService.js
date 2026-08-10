import { getSupabaseClient } from '../../lib/supabaseClient';
import { runSupabaseRequest } from './errors';

const transition = (name, args, message) => runSupabaseRequest(
  client => client.rpc(name, args),
  message,
);

export function createStandalonePCRShell(initial = {}) {
  return transition('create_standalone_pcr', { report_payload: initial }, 'Unable to create standalone PCR.');
}

export function submitStandalonePCR(pcrId) {
  return transition('submit_standalone_pcr', { target_pcr_id: pcrId }, 'Unable to submit standalone PCR.');
}

export function reviewStandalonePCR(pcrId, decision, remarks = '') {
  return transition('review_standalone_pcr', {
    target_pcr_id: pcrId,
    decision,
    remarks: remarks || null,
  }, 'Unable to review standalone PCR.');
}

export function createDispatchFromPCR(pcrId, dispatch = {}) {
  return transition('link_standalone_pcr_dispatch', {
    target_pcr_id: pcrId,
    dispatch_payload: dispatch,
  }, 'Unable to create a Dispatch Form from this PCR.');
}

export async function reviewReverseWorkflowAsAdmin(pcrId, decision, remarks = '') {
  try {
    return await transition('review_reverse_workflow_admin', {
      target_pcr_id: pcrId,
      decision,
      remarks: remarks || null,
    }, 'Unable to complete final verification.');
  } catch (error) {
    if (error?.code !== 'PGRST116') throw error;

    const expectedStatus = decision === 'approve' ? 'verified' : 'returned_for_correction';
    const { data, error: verificationError } = await getSupabaseClient()
      .from('pcr_reports')
      .select('id, status')
      .eq('id', pcrId)
      .limit(1);
    if (verificationError || data?.[0]?.status !== expectedStatus) throw error;
    return data[0].id;
  }
}

export function resubmitReverseWorkflow(pcrId) {
  return transition('resubmit_reverse_workflow_admin', { target_pcr_id: pcrId }, 'Unable to resubmit corrected records.');
}

export function returnNormalPCRToFieldOfficer(pcrId, remarks) {
  return transition('return_normal_pcr_to_field_officer', {
    target_pcr_id: pcrId,
    remarks,
  }, 'Unable to return the PCR to the Field Officer.');
}

export async function listPCRWorkflowHistory(pcrId) {
  const rows = await runSupabaseRequest(client => client
    .from('pcr_dispatch_workflow_history')
    .select('*, actor:profiles(id, display_name, email)')
    .eq('pcr_report_id', pcrId)
    .order('created_at', { ascending: true }), 'Unable to load workflow history.');
  return (rows || []).map(row => ({
    id: row.id,
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    remarks: row.remarks,
    timestamp: row.created_at,
    actor: row.actor?.display_name || row.actor?.email || 'System',
  }));
}
