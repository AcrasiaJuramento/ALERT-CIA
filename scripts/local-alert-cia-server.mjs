import http from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const host = process.env.ALERT_CIA_LOCAL_HOST || "0.0.0.0";
const port = Number(process.env.ALERT_CIA_LOCAL_PORT || 4000);
const eventClients = new Set();
const DEFAULT_LOCAL_USERS = [
  {
    id: "local-admin",
    email: "admin@mdrrmo.gov.ph",
    password: "alertcia-admin",
    name: "Local ALERT-CIA Administrator",
    role: "administrator",
    status: "active",
  },
  {
    id: "local-dispatcher",
    email: "dispatcher@mdrrmo.gov.ph",
    password: "alertcia-dispatch",
    name: "Local Dispatcher",
    role: "dispatcher",
    status: "active",
  },
  {
    id: "local-responder",
    email: "responder@mdrrmo.gov.ph",
    password: "alertcia-field",
    name: "Local Field Responder",
    role: "field_responder",
    status: "active",
  },
];

function defaultDataDir() {
  if (process.env.ALERT_CIA_LOCAL_DATA_DIR) return process.env.ALERT_CIA_LOCAL_DATA_DIR;
  if (process.env.PROGRAMDATA) return join(process.env.PROGRAMDATA, "ALERT-CIA", "local-server");
  return join(process.cwd(), ".alert-cia-local");
}

const dataDir = defaultDataDir();
const databasePath = process.env.ALERT_CIA_LOCAL_DB || join(dataDir, "alert-cia-local.db");
const configPath = join(dataDir, "alert-cia-local-config.json");
const webRoot = resolve(process.env.ALERT_CIA_WEB_ROOT || join(process.cwd(), "dist"));
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

  CREATE TABLE IF NOT EXISTS local_sync_operations (
    operation_id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    entity_type TEXT,
    entity_id TEXT,
    operation_type TEXT,
    destination TEXT,
    sync_status TEXT NOT NULL DEFAULT 'accepted',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    payload_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_local_sync_operations_entity
    ON local_sync_operations(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_local_sync_operations_status
    ON local_sync_operations(sync_status, updated_at DESC);
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

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function responseMatches(record = {}, responseId) {
  return sameId(record.responseId, responseId)
    || sameId(record.responseClientId, responseId)
    || sameId(record.response_id, responseId)
    || sameId(record.response?.id, responseId)
    || sameId(record.response?.client_generated_id, responseId);
}

function findPcrById(id) {
  return pcrReports.values().find(record => record.id === id || record.pcrId === id);
}

function findPcrByResponse(responseId) {
  return pcrReports.get(responseId)
    || pcrReports.values().find(record => responseMatches(record, responseId))
    || null;
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

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(res, filePath) {
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": extname(filePath).toLowerCase() === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  res.end(body);
}

function staticFileForPath(pathname) {
  if (!existsSync(webRoot)) return null;
  const cleanPath = decodeURIComponent(pathname).replace(/\\/g, "/");
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const target = normalize(join(webRoot, requested));
  if (!target.startsWith(webRoot)) return null;
  try {
    const stat = statSync(target);
    if (stat.isFile()) return target;
  } catch {
    // Fall through to React app shell.
  }
  return join(webRoot, "index.html");
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

function localUsers() {
  if (process.env.ALERT_CIA_LOCAL_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ALERT_CIA_LOCAL_USERS_JSON);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to file/default accounts.
    }
  }
  const usersPath = join(dataDir, "local-users.json");
  if (existsSync(usersPath)) {
    try {
      const parsed = JSON.parse(readFileSync(usersPath, "utf8"));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to default accounts.
    }
  }
  writeFileSync(usersPath, `${JSON.stringify(DEFAULT_LOCAL_USERS, null, 2)}\n`);
  return DEFAULT_LOCAL_USERS;
}

function publicUser(user) {
  const { password, passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return {
    passwordSalt: salt,
    passwordHash: scryptSync(String(password), salt, 32).toString("hex"),
  };
}

function passwordMatches(user, password) {
  if (user.passwordHash && user.passwordSalt) {
    const expected = Buffer.from(user.passwordHash, "hex");
    const actual = scryptSync(String(password), user.passwordSalt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return String(user.password || "") === String(password || "");
}

function saveLocalUser(user, password) {
  const usersPath = join(dataDir, "local-users.json");
  const users = localUsers();
  const email = String(user.email || "").trim().toLowerCase();
  const nextUser = {
    id: user.id || `local-${email}`,
    email,
    name: user.name || user.email || "ALERT-CIA User",
    role: user.role || "field_responder",
    status: user.status || "active",
    ...hashPassword(password),
  };
  const index = users.findIndex(account => String(account.email || "").toLowerCase() === email);
  if (index >= 0) users[index] = { ...users[index], ...nextUser, password: undefined };
  else users.push(nextUser);
  writeFileSync(usersPath, `${JSON.stringify(users, null, 2)}\n`);
  return nextUser;
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

function persistSyncOperation(operation = {}) {
  const operationId = operation.operation_id || operation.id;
  if (!operationId) throw new Error("Sync operation_id is required.");
  const now = new Date().toISOString();
  const existing = db.prepare(`
    SELECT operation_id, sync_status
    FROM local_sync_operations
    WHERE operation_id = ?
       OR (idempotency_key IS NOT NULL AND idempotency_key = ?)
    LIMIT 1
  `).get(operationId, operation.idempotency_key || null);
  const normalized = {
    ...operation,
    operation_id: existing?.operation_id || operationId,
    sync_status: existing?.sync_status || "accepted",
    received_at_local: now,
  };
  db.prepare(`
    INSERT INTO local_sync_operations (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      destination, sync_status, attempts, created_at, updated_at, payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id) DO UPDATE SET
      idempotency_key = coalesce(excluded.idempotency_key, local_sync_operations.idempotency_key),
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      operation_type = excluded.operation_type,
      destination = excluded.destination,
      updated_at = excluded.updated_at,
      payload_json = excluded.payload_json
  `).run(
    normalized.operation_id,
    normalized.idempotency_key || null,
    normalized.entity_type || null,
    normalized.entity_id || null,
    normalized.operation_type || null,
    normalized.destination || null,
    normalized.sync_status,
    Number(normalized.attempts || 0),
    operation.created_at_device || now,
    now,
    JSON.stringify(normalized),
  );
  return normalized;
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
  const respondingTeam = payload.respondingTeam || payload.team || "";
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
    team: respondingTeam,
    respondingTeam,
    respondingTeamId: payload.respondingTeamId || null,
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
  return [...dispatches.values()].find(dispatch => responseMatches(dispatch, responseId));
}

function withLocalSubmittedPcr(dispatch, pcr, submittedAt) {
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
    status: "Submitted",
    localStatus: "Submitted Locally",
    syncLabel: "Pending cloud synchronization",
    pcrStatus: pcr.status,
    pcrSubmittedAt: pcr.submittedAt || submittedAt,
    linkedPcrId: pcr.id || pcr.pcrId,
    pcr,
    updatedAt: submittedAt,
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
        stagedSyncOperations: db.prepare("SELECT count(*) AS count FROM local_sync_operations WHERE sync_status = 'accepted'").get().count,
        eventClients: eventClients.size,
      });
      return;
    }

    if (req.method === "GET" && ["/alert-cia-local-config.json", "/.well-known/alert-cia-local.json"].includes(url.pathname)) {
      json(res, 200, localServerConfig());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = localUsers().find(account =>
        String(account.email || "").toLowerCase() === email
        && passwordMatches(account, password)
        && (account.status || "active") === "active"
      );
      if (!user) {
        json(res, 401, { error: "Invalid local ALERT-CIA credentials." });
        return;
      }
      json(res, 200, publicUser(user));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/cache-user") {
      const body = await readBody(req);
      if (!body.user?.email || !body.password) {
        json(res, 400, { error: "User email and password are required for offline credential caching." });
        return;
      }
      const user = saveLocalUser(body.user, body.password);
      json(res, 200, publicUser(user));
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
      const pcrId = findPcrByResponse(dispatch.responseId || accept[1])?.id || randomUUID();
      const pcr = {
        ...dispatch,
        team: dispatch.team || dispatch.respondingTeam || "",
        respondingTeam: dispatch.respondingTeam || dispatch.team || "",
        respondingTeamId: dispatch.respondingTeamId || null,
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
      json(res, 200, findPcrByResponse(pcrByResponse[1]));
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
      const existing = findPcrByResponse(responseId) || {};
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
      const existing = findPcrByResponse(responseId) || {};
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
        completedAt: existing.completedAt || payload.completedAt || "",
        backToBase: existing.backToBase || "",
        source: "local_server",
        sync_status: "partially_synced",
        syncLabel: "Pending cloud synchronization",
        updatedAt: submittedAt,
      };
      pcrReports.set(responseId, record);
      const submittedDispatch = dispatch ? withLocalSubmittedPcr(dispatch, record, submittedAt) : null;
      if (submittedDispatch) dispatches.set(submittedDispatch.id, submittedDispatch);
      broadcastEvent("pcr_changed", { pcrId: record.id, responseId: record.responseId, status: record.status, record });
      if (submittedDispatch) broadcastEvent("dispatch_changed", { dispatchId: submittedDispatch.id, responseId: submittedDispatch.responseId, status: submittedDispatch.status, record: submittedDispatch });
      json(res, 200, {
        ...record,
        dispatch: submittedDispatch,
        hybridMessage: "PCR submitted locally and returned to dispatcher through the local ALERT-CIA server.",
      });
      return;
    }

    const backToBase = url.pathname.match(/^\/api\/responses\/([^/]+)\/back-to-base$/);
    if (req.method === "POST" && backToBase) {
      const dispatch = findDispatchByResponse(backToBase[1]);
      const pcr = findPcrByResponse(backToBase[1]);
      if (!dispatch || !pcr) {
        json(res, 404, { error: "No linked PCR report found on local server." });
        return;
      }
      const completedAt = pcr.completedAt || dispatch.resolvedAt || new Date().toISOString();
      const now = new Date();
      const time = pcr.backToBase || dispatch.backToBase || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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
      pcrReports.set(completedPcr.responseId || backToBase[1], completedPcr);
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
      const operation = persistSyncOperation(await readBody(req));
      broadcastEvent("sync_operation_staged", {
        operationId: operation.operation_id,
        entityType: operation.entity_type,
        entityId: operation.entity_id,
      });
      json(res, 202, {
        accepted: true,
        operationId: operation.operation_id,
        idempotencyKey: operation.idempotency_key || null,
        status: operation.sync_status,
        stagedAt: operation.received_at_local,
      });
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && !url.pathname.startsWith("/api/")) {
      const filePath = staticFileForPath(url.pathname);
      if (filePath && existsSync(filePath)) {
        sendFile(res, filePath);
        return;
      }
    }

    json(res, 404, { error: "Local ALERT-CIA endpoint not found. Build the frontend with npm run build so the local server can serve ALERT-CIA pages." });
  } catch (error) {
    json(res, 500, { error: error.message || "Local ALERT-CIA server error." });
  }
});

server.listen(port, host, () => {
  console.log(`ALERT-CIA local dev server listening at http://${host}:${port}`);
  console.log(`ALERT-CIA local database: ${databasePath}`);
  console.log(`ALERT-CIA local web root: ${webRoot}`);
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
