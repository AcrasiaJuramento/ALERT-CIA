import http from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const host = process.env.ALERT_CIA_LOCAL_HOST || "0.0.0.0";
const port = Number(process.env.ALERT_CIA_LOCAL_PORT || 4000);
const eventClients = new Set();

function defaultDataDir() {
  if (process.env.ALERT_CIA_LOCAL_DATA_DIR) return process.env.ALERT_CIA_LOCAL_DATA_DIR;
  if (process.env.PROGRAMDATA) return join(process.env.PROGRAMDATA, "ALERT-CIA", "local-server");
  return join(process.cwd(), ".alert-cia-local");
}

const dataDir = defaultDataDir();
const databasePath = process.env.ALERT_CIA_LOCAL_DB || join(dataDir, "alert-cia-local.db");
const configPath = join(dataDir, "alert-cia-local-config.json");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS local_records (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    response_id TEXT,
    dispatch_id TEXT,
    status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    record_json TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_local_records_entity_response
    ON local_records(entity_type, response_id)
    WHERE response_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_local_records_entity_updated
    ON local_records(entity_type, updated_at DESC);
`);

function parseRecord(row) {
  if (!row?.record_json) return null;
  try {
    return JSON.parse(row.record_json);
  } catch {
    return null;
  }
}

class PersistentRecordMap {
  constructor(entityType, keyField = "id") {
    this.entityType = entityType;
    this.keyField = keyField;
  }

  get size() {
    return db.prepare("SELECT count(*) AS count FROM local_records WHERE entity_type = ?").get(this.entityType).count;
  }

  get(key) {
    const row = db.prepare("SELECT record_json FROM local_records WHERE entity_type = ? AND entity_id = ?")
      .get(this.entityType, key);
    return parseRecord(row);
  }

  set(key, record) {
    let entityId = key || record?.[this.keyField] || record?.id || randomUUID();
    const now = new Date().toISOString();
    const responseId = record.responseId || record.response_id || null;
    if (responseId) {
      const existingByResponse = db.prepare(`
        SELECT entity_id
        FROM local_records
        WHERE entity_type = ? AND response_id = ?
        LIMIT 1
      `).get(this.entityType, responseId);
      if (existingByResponse?.entity_id) entityId = existingByResponse.entity_id;
    }
    const createdAt = record.createdAt || record.created_at || now;
    const updatedAt = record.updatedAt || record.updated_at || now;
    const normalized = {
      ...record,
      [this.keyField]: record?.[this.keyField] || entityId,
      id: record?.id || entityId,
      createdAt,
      updatedAt,
    };
    db.prepare(`
      INSERT INTO local_records (entity_type, entity_id, response_id, dispatch_id, status, created_at, updated_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET
        response_id = excluded.response_id,
        dispatch_id = excluded.dispatch_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json
    `).run(
      this.entityType,
      entityId,
      responseId,
      normalized.dispatchId || normalized.dispatch_id || null,
      normalized.status || normalized.localStatus || null,
      createdAt,
      updatedAt,
      JSON.stringify(normalized),
    );
    return this;
  }

  values() {
    return db.prepare("SELECT record_json FROM local_records WHERE entity_type = ? ORDER BY updated_at DESC")
      .all(this.entityType)
      .map(parseRecord)
      .filter(Boolean);
  }
}

const dispatches = new PersistentRecordMap("dispatch", "id");
const pcrReports = new PersistentRecordMap("pcr", "responseId");

function findPcrById(id) {
  return pcrReports.values().find(record => record.id === id || record.pcrId === id);
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-ALERT-CIA-Device-ID",
  });
  res.end(JSON.stringify(body));
}

function localServerConfig() {
  const configuredHost = process.env.ALERT_CIA_ADVERTISED_HOST || process.env.ALERT_CIA_LOCAL_ADVERTISED_HOST || "192.168.100.8";
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      // Fall through and regenerate a valid config file.
    }
  }
  const config = {
    server: {
      protocol: process.env.ALERT_CIA_LOCAL_PROTOCOL || "http",
      host: configuredHost,
      port,
    },
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function openEventStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  const client = { res, heartbeat: setInterval(() => res.write(": heartbeat\n\n"), 25000) };
  eventClients.add(client);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);
  req.on("close", () => {
    clearInterval(client.heartbeat);
    eventClients.delete(client);
  });
}

function broadcastEvent(type, payload = {}) {
  const event = {
    type,
    payload,
    at: new Date().toISOString(),
  };
  const body = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of eventClients) {
    try {
      client.res.write(body);
    } catch {
      clearInterval(client.heartbeat);
      eventClients.delete(client);
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy(new Error("Request body too large."));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeDispatch(payload = {}) {
  const id = payload.dispatchId || payload.id || randomUUID();
  const responseId = payload.responseClientId || payload.responseId || randomUUID();
  const patients = (payload.patients?.length ? payload.patients : []).map((patient, index) => ({
    ...patient,
    id: patient.id || patient.patientClientId || randomUUID(),
    patientClientId: patient.patientClientId || patient.id || null,
    order: patient.order || index + 1,
  }));
  patients.forEach(patient => {
    patient.patientClientId = patient.patientClientId || patient.id;
  });
  return {
    ...payload,
    id,
    dispatchId: id,
    dispatchClientId: payload.dispatchClientId || id,
    responseId,
    responseClientId: responseId,
    responseNumber: payload.responseNumber || `LOCAL-${String(Date.now()).slice(-6)}`,
    patients,
    status: payload.status || "Draft",
    source: "local_server",
    hybridMessage: "Dispatch saved to local ALERT-CIA server. Pending cloud synchronization.",
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function findDispatchByResponse(responseId) {
  return [...dispatches.values()].find(dispatch => dispatch.responseId === responseId);
}

function withLocalCompletion(dispatch, pcr, completedAt) {
  const patients = dispatch.patients?.length
    ? dispatch.patients.map((patient, index) => index === 0 ? {
      ...patient,
      name: pcr.patientName || patient.name,
      age: pcr.age || patient.age,
      gender: pcr.gender || patient.gender,
      birthdate: pcr.birthday || patient.birthdate,
      address: pcr.address || patient.address,
      assessmentFindings: pcr.chiefComplaint || patient.assessmentFindings,
    } : patient)
    : [{
      id: pcr.patientId || randomUUID(),
      name: pcr.patientName || "",
      age: pcr.age || "",
      gender: pcr.gender || "",
      birthdate: pcr.birthday || "",
      address: pcr.address || "",
      assessmentFindings: pcr.chiefComplaint || "",
    }];
  return {
    ...dispatch,
    patients,
    patientName: pcr.patientName || dispatch.patientName,
    age: pcr.age || dispatch.age,
    gender: pcr.gender || dispatch.gender,
    birthday: pcr.birthday || dispatch.birthday,
    address: pcr.address || dispatch.address,
    status: "Submitted Locally",
    localStatus: "Submitted Locally",
    syncLabel: "Pending cloud synchronization",
    pcrStatus: pcr.status,
    pcrCompletedAt: pcr.completedAt || completedAt,
    linkedPcrId: pcr.id || pcr.pcrId,
    pcr,
    updatedAt: completedAt,
    hybridMessage: "PCR submitted locally by responding team. Pending cloud synchronization.",
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${host}:${port}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        service: "alert-cia-local-server",
        persistence: "sqlite",
        databasePath,
        dispatches: dispatches.size,
        pcrReports: pcrReports.size,
        eventClients: eventClients.size,
      });
      return;
    }

    if (req.method === "GET" && ["/alert-cia-local-config.json", "/.well-known/alert-cia-local.json"].includes(url.pathname)) {
      json(res, 200, localServerConfig());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      openEventStream(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/dispatches/received") {
      const rows = [...dispatches.values()]
        .filter(dispatch => ["Sent to Responding Team", "Assigned locally", "Accepted by Responding Team", "PCR In Progress", "PCR Completed", "Submitted", "Submitted Locally", "Verified"].includes(dispatch.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      json(res, 200, rows);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/dispatches") {
      const rows = [...dispatches.values()]
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
      json(res, 200, rows);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pcr-reports") {
      const rows = [...pcrReports.values()]
        .sort((a, b) => String(b.updatedAt || b.completedAt || "").localeCompare(String(a.updatedAt || a.completedAt || "")));
      json(res, 200, rows);
      return;
    }

    const dispatchGet = url.pathname.match(/^\/api\/dispatches\/([^/]+)$/);
    if (req.method === "GET" && dispatchGet) {
      const record = dispatches.get(dispatchGet[1]);
      if (!record) {
        json(res, 404, { error: "Dispatch not found on local server." });
        return;
      }
      json(res, 200, record);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dispatches") {
      const record = normalizeDispatch(await readBody(req));
      dispatches.set(record.id, record);
      broadcastEvent("dispatch_changed", { dispatchId: record.id, responseId: record.responseId, status: record.status, record });
      json(res, 201, record);
      return;
    }

    const dispatchUpdate = url.pathname.match(/^\/api\/dispatches\/([^/]+)$/);
    if (req.method === "PUT" && dispatchUpdate) {
      const id = dispatchUpdate[1];
      const existing = dispatches.get(id) || {};
      const record = normalizeDispatch({ ...existing, ...(await readBody(req)), id });
      dispatches.set(id, record);
      broadcastEvent("dispatch_changed", { dispatchId: record.id, responseId: record.responseId, status: record.status, record });
      json(res, 200, record);
      return;
    }

    const dispatchSend = url.pathname.match(/^\/api\/dispatches\/([^/]+)\/send$/);
    if (req.method === "POST" && dispatchSend) {
      const id = dispatchSend[1];
      const existing = dispatches.get(id);
      if (!existing) {
        json(res, 404, { error: "Dispatch not found on local server." });
        return;
      }
      if (["Submitted", "Submitted Locally", "Verified"].includes(existing.status) || ["Submitted Locally", "Verified"].includes(existing.localStatus)) {
        json(res, 409, { error: "This dispatch already has a completed PCR and cannot be sent again." });
        return;
      }
      const record = {
        ...existing,
        status: "Sent to Responding Team",
        localStatus: "Sent to Responding Team Locally",
        syncLabel: "Pending cloud synchronization",
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hybridMessage: "Assigned locally. Waiting for officer acknowledgement.",
      };
      dispatches.set(id, record);
      broadcastEvent("dispatch_changed", { dispatchId: record.id, responseId: record.responseId, status: record.status, record });
      json(res, 200, record);
      return;
    }

    const accept = url.pathname.match(/^\/api\/responses\/([^/]+)\/accept$/);
    if (req.method === "POST" && accept) {
      const dispatch = findDispatchByResponse(accept[1]);
      if (!dispatch) {
        json(res, 404, { error: "Response not found on local server." });
        return;
      }
      const pcrId = pcrReports.get(dispatch.responseId)?.id || randomUUID();
      const pcr = {
        ...dispatch,
        id: pcrId,
        pcrId,
        responseId: dispatch.responseId,
        dispatchId: dispatch.id,
        patientId: dispatch.patients?.[0]?.id || dispatch.patientId || null,
        responseNumber: dispatch.responseNumber,
        status: "In Progress",
        localStatus: "PCR Draft Locally",
        source: "local_server",
        sync_status: "partially_synced",
        updatedAt: new Date().toISOString(),
      };
      pcrReports.set(dispatch.responseId, pcr);
      const acceptedDispatch = {
        ...dispatch,
        status: "PCR In Progress",
        localStatus: "Dispatch Received Locally",
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      dispatches.set(dispatch.id, acceptedDispatch);
      broadcastEvent("pcr_changed", { pcrId: pcr.id, responseId: pcr.responseId, status: pcr.status, record: pcr });
      broadcastEvent("dispatch_changed", { dispatchId: acceptedDispatch.id, responseId: acceptedDispatch.responseId, status: acceptedDispatch.status, record: acceptedDispatch });
      json(res, 200, { pcrId, pcr });
      return;
    }

    const pcrByResponse = url.pathname.match(/^\/api\/responses\/([^/]+)\/pcr$/);
    if (req.method === "GET" && pcrByResponse) {
      json(res, 200, pcrReports.get(pcrByResponse[1]) || null);
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/pcr-reports") {
      const payload = await readBody(req);
      const id = payload.pcrId || payload.id || randomUUID();
      const responseId = payload.responseId;
      if (!responseId) {
        json(res, 400, { error: "PCR responseId is required for local sync." });
        return;
      }
      const existing = pcrReports.get(responseId) || {};
      const record = {
        ...existing,
        ...payload,
        id,
        pcrId: id,
        responseId,
        dispatchId: payload.dispatchId || existing.dispatchId || null,
        status: payload.status || existing.status || "Draft",
        source: "local_server",
        sync_status: "partially_synced",
        updatedAt: new Date().toISOString(),
      };
      pcrReports.set(responseId, record);
      broadcastEvent("pcr_changed", { pcrId: record.id, responseId: record.responseId, status: record.status, record });
      json(res, 200, {
        ...record,
        hybridMessage: "PCR saved to local ALERT-CIA server and queued for cloud synchronization.",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/pcr-reports/submit") {
      const payload = await readBody(req);
      const id = payload.pcrId || payload.id || randomUUID();
      const responseId = payload.responseId;
      if (!responseId) {
        json(res, 400, { error: "PCR responseId is required for local submission." });
        return;
      }
      const existing = pcrReports.get(responseId) || {};
      const submittedAt = new Date().toISOString();
      const dispatch = payload.dispatchId
        ? dispatches.get(payload.dispatchId)
        : findDispatchByResponse(responseId);
      const record = {
        ...existing,
        ...payload,
        id,
        pcrId: id,
        responseId,
        dispatchId: payload.dispatchId || existing.dispatchId || dispatch?.id || null,
        status: "Submitted",
        localStatus: "Submitted Locally",
        submittedAt,
        completedAt: payload.completedAt || submittedAt,
        source: "local_server",
        sync_status: "partially_synced",
        syncLabel: "Pending cloud synchronization",
        updatedAt: submittedAt,
      };
      pcrReports.set(responseId, record);
      const completedDispatch = dispatch ? withLocalCompletion(dispatch, record, submittedAt) : null;
      if (completedDispatch) dispatches.set(completedDispatch.id, completedDispatch);
      broadcastEvent("pcr_changed", { pcrId: record.id, responseId: record.responseId, status: record.status, record });
      if (completedDispatch) broadcastEvent("dispatch_changed", { dispatchId: completedDispatch.id, responseId: completedDispatch.responseId, status: completedDispatch.status, record: completedDispatch });
      json(res, 200, {
        ...record,
        dispatch: completedDispatch,
        hybridMessage: "PCR submitted locally and returned to dispatcher through the local ALERT-CIA server.",
      });
      return;
    }

    const backToBase = url.pathname.match(/^\/api\/responses\/([^/]+)\/back-to-base$/);
    if (req.method === "POST" && backToBase) {
      const dispatch = findDispatchByResponse(backToBase[1]);
      const pcr = pcrReports.get(backToBase[1]);
      if (!dispatch || !pcr) {
        json(res, 404, { error: "No linked PCR report found on local server." });
        return;
      }
      const completedAt = new Date().toISOString();
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const completedPcr = {
        ...pcr,
        status: "Submitted",
        localStatus: "Submitted Locally",
        syncLabel: "Pending cloud synchronization",
        completedAt,
        backToBase: pcr.backToBase || time,
      };
      const completedDispatch = {
        ...dispatch,
        status: "Submitted Locally",
        localStatus: "Submitted Locally",
        syncLabel: "Pending cloud synchronization",
        resolvedAt: completedAt,
        backToBase: dispatch.backToBase || time,
        pcrStatus: "Submitted",
        pcrCompletedAt: completedAt,
        linkedPcrId: completedPcr.id || completedPcr.pcrId,
        pcr: completedPcr,
        updatedAt: completedAt,
      };
      dispatches.set(dispatch.id, completedDispatch);
      pcrReports.set(backToBase[1], completedPcr);
      broadcastEvent("pcr_changed", { pcrId: completedPcr.id, responseId: completedPcr.responseId, status: completedPcr.status, record: completedPcr });
      broadcastEvent("dispatch_changed", { dispatchId: completedDispatch.id, responseId: completedDispatch.responseId, status: completedDispatch.status, record: completedDispatch });
      json(res, 200, { dispatch: completedDispatch, pcr: completedPcr });
      return;
    }

    const pcrById = url.pathname.match(/^\/api\/pcr-reports\/([^/]+)$/);
    if (req.method === "GET" && pcrById) {
      const pcr = findPcrById(pcrById[1]);
      if (!pcr) {
        json(res, 404, { error: "PCR report not found on local server." });
        return;
      }
      json(res, 200, pcr);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/sync/operations") {
      json(res, 202, { accepted: true, operationId: (await readBody(req)).operation_id || null });
      return;
    }

    json(res, 404, { error: "Local ALERT-CIA dev endpoint not found." });
  } catch (error) {
    json(res, 500, { error: error.message || "Local ALERT-CIA server error." });
  }
});

server.listen(port, host, () => {
  console.log(`ALERT-CIA local dev server listening at http://${host}:${port}`);
  console.log(`ALERT-CIA local database: ${databasePath}`);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. The ALERT-CIA local server may already be running.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
