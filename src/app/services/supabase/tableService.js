import { runSupabaseRequest } from "./errors";

export async function fetchRows(tableName, { select = "*", filters = {}, limit = 100, from = 0, orderBy = "created_at" } = {}) {
  return runSupabaseRequest(client => {
    let query = client.from(tableName).select(select).range(from, from + limit - 1);
    Object.entries(filters).forEach(([column, value]) => {
      if (value !== undefined && value !== null && value !== "") query = query.eq(column, value);
    });
    if (orderBy) query = query.order(orderBy, { ascending: false });
    return query;
  }, `Unable to load ${tableName}.`);
}

export async function insertRow(tableName, payload, select = "*") {
  return runSupabaseRequest(client =>
    client.from(tableName).insert(payload).select(select).single(),
  `Unable to create ${tableName} record.`);
}

export async function updateRow(tableName, id, payload, select = "*") {
  return runSupabaseRequest(client =>
    client.from(tableName).update(payload).eq("id", id).select(select).single(),
  `Unable to update ${tableName} record.`);
}

export async function softDeleteRow(tableName, id) {
  return updateRow(tableName, id, { deleted_at: new Date().toISOString() });
}
