import { runSupabaseRequest } from "./errors";

export async function listAuditLogs({ responseId, tableName, limit = 100 } = {}) {
  return runSupabaseRequest(client => {
    let query = client
      .from("audit_logs")
      .select("*, actor:profiles(id, display_name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (responseId) query = query.eq("response_id", responseId);
    if (tableName) query = query.eq("table_name", tableName);
    return query;
  }, "Unable to load audit logs.");
}

export async function createDataExport(exportRequest) {
  return runSupabaseRequest(client =>
    client.from("data_exports").insert({
      export_type: exportRequest.exportType,
      storage_path: exportRequest.storagePath || null,
      filters: exportRequest.filters || {},
      status: exportRequest.status || "pending",
    }).select("*").single(),
  "Unable to create data export record.");
}
