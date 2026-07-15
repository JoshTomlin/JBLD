import {
  getAlgLibraryCaseLookupCodes,
  getDefaultAlgLibraryMemoWord,
  getAlgLibrarySearchAliases,
  getAlgLibrarySearchNeedles,
} from "./algLibrarySpecialCases";

const DATABASE_PATH = "idb://jbld-local-db";
const SCHEMA_VERSION = 5;
const LOCAL_APP_META_KEY = "jbld-local-app-meta";
const LOCAL_ALG_LIBRARY_KEY = "jbld-local-alg-library";
const DEFAULT_ALG_LAST_SEEN_AT = "2026-01-01T00:00:00.000Z";

let dbPromise = null;
let migrationPromise = null;

function resolvePGliteConstructor(moduleExports, visited = new WeakSet()) {
  if (!moduleExports) {
    return null;
  }

  if (typeof moduleExports === "function") {
    return moduleExports;
  }

  if (typeof moduleExports !== "object") {
    return null;
  }

  if (visited.has(moduleExports)) {
    return null;
  }
  visited.add(moduleExports);

  if (typeof moduleExports.PGlite === "function") {
    return moduleExports.PGlite;
  }

  if (moduleExports.default) {
    const nestedDefault = resolvePGliteConstructor(moduleExports.default, visited);
    if (nestedDefault) {
      return nestedDefault;
    }
  }

  const keys = Array.from(new Set([
    ...Object.keys(moduleExports),
    ...Object.getOwnPropertyNames(moduleExports),
  ]));

  for (const key of keys) {
    const value = moduleExports[key];
    if (typeof value === "function" && (key === "PGlite" || value.name === "PGlite")) {
      return value;
    }
  }

  for (const key of keys) {
    const nestedValue = moduleExports[key];
    if (nestedValue && typeof nestedValue === "object") {
      const nestedConstructor = resolvePGliteConstructor(nestedValue, visited);
      if (nestedConstructor) {
        return nestedConstructor;
      }
    }
  }

  return null;
}

function describeModuleShape(moduleExports) {
  if (!moduleExports) {
    return "(none)";
  }

  if (typeof moduleExports !== "object" && typeof moduleExports !== "function") {
    return typeof moduleExports;
  }

  const topLevelKeys = Array.from(new Set([
    ...Object.keys(moduleExports),
    ...Object.getOwnPropertyNames(moduleExports),
  ]));

  const defaultValue = moduleExports.default;
  const defaultKeys =
    defaultValue && (typeof defaultValue === "object" || typeof defaultValue === "function")
      ? Array.from(new Set([
          ...Object.keys(defaultValue),
          ...Object.getOwnPropertyNames(defaultValue),
        ]))
      : [];

  return `top-level keys: ${topLevelKeys.join(", ") || "(none)"}; default keys: ${
    defaultKeys.join(", ") || "(none)"
  }`;
}

async function loadPGliteConstructor() {
  const loadErrors = [];

  try {
    // Use Webpack's CommonJS resolution path so CRA 4 does not need to parse import.meta from the ESM build.
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const requiredModule = require("@electric-sql/pglite/dist/index.cjs");
    const requiredConstructor = resolvePGliteConstructor(requiredModule);
    if (requiredConstructor) {
      return requiredConstructor;
    }
    loadErrors.push(`require(@electric-sql/pglite/dist/index.cjs): ${describeModuleShape(requiredModule)}`);
  } catch (error) {
    loadErrors.push(
      `require(@electric-sql/pglite/dist/index.cjs): ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  try {
    const moduleExports = await import("@electric-sql/pglite/dist/index.cjs");
    const importedConstructor = resolvePGliteConstructor(moduleExports);
    if (importedConstructor) {
      return importedConstructor;
    }
    loadErrors.push(`import(@electric-sql/pglite/dist/index.cjs): ${describeModuleShape(moduleExports)}`);
  } catch (error) {
    loadErrors.push(
      `import(@electric-sql/pglite/dist/index.cjs): ${
        error && error.message ? error.message : String(error)
      }`
    );
  }

  throw new Error(
    `PGlite could not be loaded in this browser. ${loadErrors.join(" | ")}`
  );
}

function safeJsonParse(value, fallbackValue) {
  if (!value || typeof value !== "string") {
    return fallbackValue;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallbackValue;
  }
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocalJson(key, fallbackValue) {
  if (!hasWindowStorage()) {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue === null ? fallbackValue : safeJsonParse(rawValue, fallbackValue);
  } catch (_error) {
    return fallbackValue;
  }
}

function writeLocalJson(key, value) {
  if (!hasWindowStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeAlgLibraryEntry(entry = {}) {
  const pieceType = entry.piece_type || entry.pieceType || "unknown";
  const caseCode = entry.case_code || entry.caseCode || "";
  const lastSeenAt = toIsoDate(
    entry.last_seen_at || entry.lastSeenAt || entry.lastSeen,
    DEFAULT_ALG_LAST_SEEN_AT
  );
  return {
    id: String(entry.id || ""),
    piece_type: pieceType === "corner_memo" ? "corner" : pieceType === "edge_memo" ? "edge" : pieceType,
    sheet_name: entry.sheet_name || entry.sheetName || null,
    row_index:
      Number.isFinite(Number(entry.row_index ?? entry.rowIndex)) ? Number(entry.row_index ?? entry.rowIndex) : null,
    case_code: caseCode,
    description: entry.description || entry.notation || "",
    alg: entry.alg || entry.expandedAlg || "",
    memo_word:
      entry.memo_word ||
      entry.memoWord ||
      entry.memo ||
      getDefaultAlgLibraryMemoWord(pieceType, caseCode) ||
      null,
    category: entry.category || null,
    notes: entry.notes || null,
    last_seen_at: lastSeenAt,
    updated_at: entry.updated_at || new Date().toISOString(),
  };
}

function isDetachedMemoEntry(entry = {}) {
  const pieceType = entry.piece_type || entry.pieceType || "";
  return pieceType === "corner_memo" || pieceType === "edge_memo";
}

function buildAlgLibraryCaseKey(entry = {}) {
  return `${entry.piece_type || entry.pieceType || "unknown"}:${entry.case_code || entry.caseCode || ""}`;
}

function mergeAlgLibraryEntries(entries = []) {
  const mergedEntries = new Map();
  const detachedMemoByKey = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry) {
      return;
    }

    if (isDetachedMemoEntry(entry)) {
      const normalizedEntry = normalizeAlgLibraryEntry(entry);
      const caseKey = buildAlgLibraryCaseKey(normalizedEntry);
      const memoWord = normalizedEntry.memo_word || normalizedEntry.description || null;
      if (memoWord) {
        detachedMemoByKey.set(caseKey, memoWord);
      }
      return;
    }

    const normalizedEntry = normalizeAlgLibraryEntry(entry);
    const caseKey = buildAlgLibraryCaseKey(normalizedEntry);
    const existingEntry = mergedEntries.get(caseKey);
    const existingLastSeenAt = existingEntry ? normalizeAlgLibraryEntry(existingEntry).last_seen_at : null;
    mergedEntries.set(caseKey, {
      ...existingEntry,
      ...normalizedEntry,
      id:
        normalizedEntry.id ||
        (existingEntry && existingEntry.id) ||
        `${normalizedEntry.piece_type}-${String(normalizedEntry.case_code || "").toLowerCase()}`,
      memo_word:
        normalizedEntry.memo_word ||
        (existingEntry && existingEntry.memo_word) ||
        detachedMemoByKey.get(caseKey) ||
        null,
      last_seen_at:
        existingLastSeenAt && existingLastSeenAt > normalizedEntry.last_seen_at
          ? existingLastSeenAt
          : normalizedEntry.last_seen_at,
    });
  });

  detachedMemoByKey.forEach((memoWord, caseKey) => {
    const existingEntry = mergedEntries.get(caseKey);
    if (existingEntry && !existingEntry.memo_word) {
      mergedEntries.set(caseKey, {
        ...existingEntry,
        memo_word: memoWord,
      });
    }
  });

  return sortAlgLibraryEntries([...mergedEntries.values()]);
}

function readFallbackAppMeta() {
  return readLocalJson(LOCAL_APP_META_KEY, {});
}

function writeFallbackAppMeta(meta) {
  writeLocalJson(LOCAL_APP_META_KEY, meta);
}

function readFallbackAlgLibraryEntries() {
  const entries = readLocalJson(LOCAL_ALG_LIBRARY_KEY, []);
  return mergeAlgLibraryEntries(Array.isArray(entries) ? entries : []);
}

function writeFallbackAlgLibraryEntries(entries) {
  writeLocalJson(
    LOCAL_ALG_LIBRARY_KEY,
    mergeAlgLibraryEntries(Array.isArray(entries) ? entries : [])
  );
}

function sortAlgLibraryEntries(entries = []) {
  return [...entries].sort((a, b) => {
    const pieceCompare = String(a.piece_type || "").localeCompare(String(b.piece_type || ""));
    if (pieceCompare !== 0) {
      return pieceCompare;
    }

    const caseCompare = String(a.case_code || "").localeCompare(String(b.case_code || ""));
    if (caseCompare !== 0) {
      return caseCompare;
    }

    return (Number(a.row_index) || 0) - (Number(b.row_index) || 0);
  });
}

function filterAlgLibraryEntries(entries = [], { pieceType = "all", search = "", limit = 200 } = {}) {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const searchNeedles = getAlgLibrarySearchNeedles(normalizedSearch);
  const filteredEntries = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (pieceType !== "all" && entry.piece_type !== pieceType) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const aliases = getAlgLibrarySearchAliases(entry).map((value) => value.toLowerCase());
    return searchNeedles.length
      ? aliases.some((alias) => searchNeedles.some((needle) => alias.includes(needle)))
      : aliases.some((alias) => alias.includes(normalizedSearch));
  });

  return sortAlgLibraryEntries(filteredEntries).slice(0, Math.max(1, Number(limit) || 200));
}

function splitMoves(algText = "") {
  return String(algText)
    .trim()
    .split(/\s+/)
    .map((move) => move.trim())
    .filter(Boolean);
}

function toIsoDate(value, fallback = new Date().toISOString()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback;
}

function toTimestamp(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return fallback;
}

function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildCaseKey(comm) {
  const rawComm = Array.isArray(comm && comm.raw_comm) ? comm.raw_comm : [];
  const phase = comm && comm.phase ? comm.phase : "unknown";
  const specialType = comm && comm.special_type ? comm.special_type : "";
  const bufferTarget = comm && comm.buffer_target ? comm.buffer_target : "";
  const targets = [comm && comm.target_a, comm && comm.target_b].filter(Boolean).join("-");
  const rawTokens = rawComm.length ? rawComm.join("-") : "";

  return [phase, specialType, bufferTarget, targets, rawTokens].filter(Boolean).join("|") || "unknown";
}

function hashString(value) {
  let hash = 0;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildCaseId(caseKey) {
  return `case-${hashString(caseKey)}`;
}

function summarizeSpecialCounts(commStats) {
  return (Array.isArray(commStats) ? commStats : []).reduce(
    (acc, comm) => {
      if (comm && comm.phase === "parity") {
        acc.parity += 1;
      }
      if (comm && comm.special_type === "flip") {
        acc.flip += 1;
      }
      if (comm && comm.special_type === "twist") {
        acc.twist += 1;
      }
      return acc;
    },
    { parity: 0, flip: 0, twist: 0 }
  );
}

function buildSolveRow(solve, sessionId) {
  const moveTimeline = Array.isArray(solve && solve.move_timeline) ? solve.move_timeline : [];
  const commStats = Array.isArray(solve && solve.comm_stats) ? solve.comm_stats : [];
  const solveAlg = solve && solve.solve ? solve.solve : "";
  const moveCount = moveTimeline.length || splitMoves(solveAlg).length;
  const execTime = Number(solve && solve.exe_time);
  const specialCounts = summarizeSpecialCounts(commStats);

  return {
    id: String((solve && solve.id) || `solve-${Date.now()}`),
    session_id: String(sessionId),
    recorded_at: toIsoDate(solve && solve.date),
    updated_at: toIsoDate((solve && solve.updatedAt) || (solve && solve.date)),
    time_total: Number(solve && solve.time_solve) || 0,
    time_memo: Number(solve && solve.memo_time) || 0,
    time_exec: Number.isFinite(execTime) ? execTime : 0,
    fluidness: Number.isFinite(Number(solve && solve.fluidness)) ? Number(solve.fluidness) : null,
    move_count: moveCount,
    alg_count: commStats.filter((comm) => comm && comm.phase !== "unknown").length,
    tps: Number.isFinite(execTime) && execTime > 0 ? Number((moveCount / execTime).toFixed(3)) : null,
    success: !Boolean(solve && solve.DNF),
    dnf: Boolean(solve && solve.DNF),
    scramble: solve && solve.scramble ? solve.scramble : "",
    solve_alg: solveAlg,
    txt_solve: solve && solve.txt_solve ? solve.txt_solve : "",
    link: solve && solve.link ? solve.link : null,
    cube_orientation: solve && solve.cube_orientation ? solve.cube_orientation : null,
    parse_error: solve && solve.parseError ? solve.parseError : null,
    parse_version: "local-v1",
    parity_count: specialCounts.parity,
    flip_count: specialCounts.flip,
    twist_count: specialCounts.twist,
    comm_stats_json: JSON.stringify(commStats),
    move_timeline_json: JSON.stringify(moveTimeline),
  };
}

function buildCommRows(solve) {
  const commStats = Array.isArray(solve && solve.comm_stats) ? solve.comm_stats : [];
  const solveId = String((solve && solve.id) || "");

  return commStats.map((comm, index) => {
    const caseKey = buildCaseKey(comm);
    const caseId = buildCaseId(caseKey);
    return {
      id: `${solveId}-comm-${index + 1}`,
      solve_id: solveId,
      comm_index: Number(comm && comm.comm_index) || index + 1,
      case_id: caseId,
      phase: comm && comm.phase ? comm.phase : "unknown",
      special_type: comm && comm.special_type ? comm.special_type : null,
      buffer_target: comm && comm.buffer_target ? comm.buffer_target : null,
      target_a: comm && comm.target_a ? comm.target_a : null,
      target_b: comm && comm.target_b ? comm.target_b : null,
      alg_used_text: comm && comm.alg ? comm.alg : "",
      alg_length: Number(comm && comm.alg_length) || splitMoves(comm && comm.alg).length,
      recog_time:
        Number.isFinite(Number(comm && comm.recog_time)) ? Number(comm.recog_time) : null,
      exec_time: Number.isFinite(Number(comm && comm.exec_time)) ? Number(comm.exec_time) : null,
      move_start_index: Number(comm && comm.move_start_index) || null,
      move_end_index: Number(comm && comm.move_end_index) || null,
      was_best_alg: null,
      is_success: comm && comm.phase !== "unknown",
      raw_comm_json: JSON.stringify(comm && comm.raw_comm ? comm.raw_comm : []),
      canonical_key: caseKey,
    };
  });
}

function buildCaseRows(commRows) {
  const casesById = new Map();

  commRows.forEach((commRow) => {
    if (!commRow || !commRow.case_id) {
      return;
    }

    if (!casesById.has(commRow.case_id)) {
      casesById.set(commRow.case_id, {
        id: commRow.case_id,
        canonical_key: commRow.canonical_key,
        piece_type: commRow.phase,
        buffer: commRow.buffer_target || null,
        canonical_label: [commRow.buffer_target, commRow.target_a, commRow.target_b]
          .filter(Boolean)
          .join(", "),
        special_type: commRow.special_type || null,
        raw_example_json: commRow.raw_comm_json || "[]",
      });
    }
  });

  return [...casesById.values()];
}

function fromSolveRow(row) {
  return {
    id: row.id,
    date: toTimestamp(row.recorded_at),
    updatedAt: toTimestamp(row.updated_at),
    time_solve: row.time_total,
    memo_time: row.time_memo,
    exe_time: row.time_exec,
    fluidness: row.fluidness,
    DNF: Boolean(row.dnf),
    scramble: row.scramble || "",
    solve: row.solve_alg || "",
    txt_solve: row.txt_solve || "",
    link: row.link || null,
    cube_orientation: row.cube_orientation || null,
    comm_stats: safeJsonParse(row.comm_stats_json, []),
    move_timeline: safeJsonParse(row.move_timeline_json, []),
    parseError: row.parse_error || null,
  };
}

function fromSessionRows(sessionRows, solveRows) {
  const solvesBySessionId = (Array.isArray(solveRows) ? solveRows : []).reduce((acc, row) => {
    const next = acc[row.session_id] || [];
    next.push(fromSolveRow(row));
    acc[row.session_id] = next;
    return acc;
  }, {});

  return (Array.isArray(sessionRows) ? sessionRows : []).map((row) => ({
    id: row.id,
    name: row.name || "Session",
    puzzleType: row.puzzle_type || "3x3 BLD",
    scrambleType: row.scramble_type || "3x3",
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
    solves: (solvesBySessionId[row.id] || []).sort((a, b) => (a.date || 0) - (b.date || 0)),
  }));
}

async function getDatabase() {
  if (!dbPromise) {
    dbPromise = Promise.resolve().then(async () => {
      const PGlite = await loadPGliteConstructor();
      const db = new PGlite(DATABASE_PATH);
      return db;
    });
  }

  const db = await dbPromise;
  if (!migrationPromise) {
    migrationPromise = runMigrations(db);
  }
  await migrationPromise;
  return db;
}

async function runMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      puzzle_type TEXT NOT NULL DEFAULT '3x3 BLD',
      scramble_type TEXT NOT NULL DEFAULT '3x3',
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
    );

    CREATE TABLE IF NOT EXISTS solves (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      time_total DOUBLE PRECISION,
      time_memo DOUBLE PRECISION,
      time_exec DOUBLE PRECISION,
      fluidness DOUBLE PRECISION,
      move_count INTEGER NOT NULL DEFAULT 0,
      alg_count INTEGER NOT NULL DEFAULT 0,
      tps DOUBLE PRECISION,
      success BOOLEAN NOT NULL DEFAULT true,
      dnf BOOLEAN NOT NULL DEFAULT false,
      scramble TEXT,
      solve_alg TEXT,
      txt_solve TEXT,
      link TEXT,
      cube_orientation TEXT,
      parse_error TEXT,
      parse_version TEXT,
      parity_count INTEGER NOT NULL DEFAULT 0,
      flip_count INTEGER NOT NULL DEFAULT 0,
      twist_count INTEGER NOT NULL DEFAULT 0,
      comm_stats_json TEXT NOT NULL DEFAULT '[]',
      move_timeline_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS comm_cases (
      id TEXT PRIMARY KEY,
      canonical_key TEXT NOT NULL UNIQUE,
      piece_type TEXT NOT NULL,
      buffer TEXT,
      canonical_label TEXT,
      special_type TEXT,
      raw_example_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS solve_comms (
      id TEXT PRIMARY KEY,
      solve_id TEXT NOT NULL REFERENCES solves(id) ON DELETE CASCADE,
      comm_index INTEGER NOT NULL,
      case_id TEXT REFERENCES comm_cases(id) ON DELETE SET NULL,
      phase TEXT NOT NULL,
      special_type TEXT,
      buffer_target TEXT,
      target_a TEXT,
      target_b TEXT,
      alg_used_text TEXT,
      alg_length INTEGER,
      recog_time DOUBLE PRECISION,
      exec_time DOUBLE PRECISION,
      move_start_index INTEGER,
      move_end_index INTEGER,
      was_best_alg BOOLEAN,
      is_success BOOLEAN NOT NULL DEFAULT true,
      raw_comm_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS alg_library_entries (
      id TEXT PRIMARY KEY,
      piece_type TEXT NOT NULL,
      sheet_name TEXT,
      row_index INTEGER,
      case_code TEXT NOT NULL,
      comm_notation TEXT NOT NULL,
      expanded_alg TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      alg TEXT NOT NULL DEFAULT '',
      memo_word TEXT,
      category TEXT,
      notes TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
    );

    CREATE INDEX IF NOT EXISTS solves_session_id_idx
      ON solves (session_id, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS solve_comms_case_id_idx
      ON solve_comms (case_id, phase);

    CREATE INDEX IF NOT EXISTS alg_library_entries_piece_type_idx
      ON alg_library_entries (piece_type, case_code);

    INSERT INTO app_meta (key, value_json)
    VALUES ('schema_version', ${quoteSqlString(JSON.stringify(SCHEMA_VERSION))})
    ON CONFLICT (key) DO UPDATE
      SET value_json = EXCLUDED.value_json,
          updated_at = timezone('utc', now());
  `);

  await db.exec(`
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS alg TEXT NOT NULL DEFAULT '';
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS memo_word TEXT;
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

    UPDATE alg_library_entries
    SET last_seen_at = '2026-01-01T00:00:00.000Z'
    WHERE last_seen_at IS NULL;

    UPDATE alg_library_entries
    SET
      description = CASE
        WHEN description IS NULL OR description = '' THEN comm_notation
        ELSE description
      END,
      alg = CASE
        WHEN alg IS NULL OR alg = '' THEN expanded_alg
        ELSE alg
      END
    WHERE
      (description IS NULL OR description = '')
      OR (alg IS NULL OR alg = '');

    UPDATE alg_library_entries AS primary_entry
    SET memo_word = CASE
      WHEN primary_entry.memo_word IS NULL OR primary_entry.memo_word = '' THEN memo_entry.description
      ELSE primary_entry.memo_word
    END
    FROM alg_library_entries AS memo_entry
    WHERE primary_entry.case_code = memo_entry.case_code
      AND (
        (primary_entry.piece_type = 'corner' AND memo_entry.piece_type = 'corner_memo')
        OR (primary_entry.piece_type = 'edge' AND memo_entry.piece_type = 'edge_memo')
      );

    DELETE FROM alg_library_entries
    WHERE piece_type IN ('corner_memo', 'edge_memo');
  `);
}

export async function loadDatasetFromDatabase() {
  const db = await getDatabase();
  const [sessionResult, solveResult, metaResult] = await Promise.all([
    db.query("SELECT * FROM sessions ORDER BY created_at ASC"),
    db.query("SELECT * FROM solves ORDER BY recorded_at ASC"),
    db.query("SELECT value_json FROM app_meta WHERE key = $1", ["active_session_id"]),
  ]);

  const sessions = fromSessionRows(sessionResult.rows, solveResult.rows);
  const activeSessionIdRow = metaResult.rows && metaResult.rows[0];
  const activeSessionId = activeSessionIdRow
    ? safeJsonParse(activeSessionIdRow.value_json, null)
    : null;

  return {
    sessions,
    activeSessionId:
      activeSessionId || (sessions.length > 0 ? sessions[0].id : null),
  };
}

export async function persistDatasetToDatabase({ sessions, activeSessionId }) {
  const db = await getDatabase();
  const normalizedSessions = Array.isArray(sessions) ? sessions : [];
  const solveRows = normalizedSessions.flatMap((session) =>
    (Array.isArray(session.solves) ? session.solves : []).map((solve) => buildSolveRow(solve, session.id))
  );
  const commRows = solveRows.flatMap((solveRow) => {
    const session = normalizedSessions.find((entry) => entry.id === solveRow.session_id);
    const solve = session && Array.isArray(session.solves)
      ? session.solves.find((entry) => String(entry.id) === solveRow.id)
      : null;
    return buildCommRows(solve);
  });
  const caseRows = buildCaseRows(commRows);

  await db.exec("BEGIN");

  try {
    await db.exec(`
      DELETE FROM solve_comms;
      DELETE FROM solves;
      DELETE FROM comm_cases;
      DELETE FROM sessions;
    `);

    for (const session of normalizedSessions) {
      await db.query(
        `INSERT INTO sessions (
          id, name, puzzle_type, scramble_type, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          String(session.id),
          session.name || "Session",
          session.puzzleType || "3x3 BLD",
          session.scrambleType || "3x3",
          toIsoDate(session.createdAt),
          toIsoDate(session.updatedAt || session.createdAt),
        ]
      );
    }

    for (const solve of solveRows) {
      await db.query(
        `INSERT INTO solves (
          id, session_id, recorded_at, updated_at, time_total, time_memo, time_exec, fluidness,
          move_count, alg_count, tps, success, dnf, scramble, solve_alg, txt_solve, link,
          cube_orientation, parse_error, parse_version, parity_count, flip_count, twist_count,
          comm_stats_json, move_timeline_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25
        )`,
        [
          solve.id,
          solve.session_id,
          solve.recorded_at,
          solve.updated_at,
          solve.time_total,
          solve.time_memo,
          solve.time_exec,
          solve.fluidness,
          solve.move_count,
          solve.alg_count,
          solve.tps,
          solve.success,
          solve.dnf,
          solve.scramble,
          solve.solve_alg,
          solve.txt_solve,
          solve.link,
          solve.cube_orientation,
          solve.parse_error,
          solve.parse_version,
          solve.parity_count,
          solve.flip_count,
          solve.twist_count,
          solve.comm_stats_json,
          solve.move_timeline_json,
        ]
      );
    }

    for (const caseRow of caseRows) {
      await db.query(
        `INSERT INTO comm_cases (
          id, canonical_key, piece_type, buffer, canonical_label, special_type, raw_example_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          caseRow.id,
          caseRow.canonical_key,
          caseRow.piece_type,
          caseRow.buffer,
          caseRow.canonical_label,
          caseRow.special_type,
          caseRow.raw_example_json,
        ]
      );
    }

    for (const comm of commRows) {
      await db.query(
        `INSERT INTO solve_comms (
          id, solve_id, comm_index, case_id, phase, special_type, buffer_target, target_a, target_b,
          alg_used_text, alg_length, recog_time, exec_time, move_start_index, move_end_index,
          was_best_alg, is_success, raw_comm_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18
        )`,
        [
          comm.id,
          comm.solve_id,
          comm.comm_index,
          comm.case_id,
          comm.phase,
          comm.special_type,
          comm.buffer_target,
          comm.target_a,
          comm.target_b,
          comm.alg_used_text,
          comm.alg_length,
          comm.recog_time,
          comm.exec_time,
          comm.move_start_index,
          comm.move_end_index,
          comm.was_best_alg,
          comm.is_success,
          comm.raw_comm_json,
        ]
      );
    }

    await db.query(
      `INSERT INTO app_meta (key, value_json, updated_at)
       VALUES ($1, $2, timezone('utc', now()))
       ON CONFLICT (key) DO UPDATE
       SET value_json = EXCLUDED.value_json,
           updated_at = timezone('utc', now())`,
      ["active_session_id", JSON.stringify(activeSessionId || null)]
    );

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function bootstrapLegacyStorageIntoDatabase({ sessions, activeSessionId }) {
  const db = await getDatabase();
  const existingSessions = await db.query("SELECT COUNT(*)::int AS count FROM sessions");
  const rowCount =
    existingSessions.rows && existingSessions.rows[0] && Number(existingSessions.rows[0].count);

  if (rowCount > 0) {
    return loadDatasetFromDatabase();
  }

  await persistDatasetToDatabase({ sessions, activeSessionId });
  return loadDatasetFromDatabase();
}

export async function queryLocalDatabase(sql, params = []) {
  const db = await getDatabase();
  return db.query(sql, Array.isArray(params) ? params : []);
}

export async function getLocalDatabaseSummary() {
  const db = await getDatabase();
  const [sessions, solves, comms, cases] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM sessions"),
    db.query("SELECT COUNT(*)::int AS count FROM solves"),
    db.query("SELECT COUNT(*)::int AS count FROM solve_comms"),
    db.query("SELECT COUNT(*)::int AS count FROM comm_cases"),
  ]);

  return {
    sessions: Number(sessions.rows[0] && sessions.rows[0].count) || 0,
    solves: Number(solves.rows[0] && solves.rows[0].count) || 0,
    solveComms: Number(comms.rows[0] && comms.rows[0].count) || 0,
    commCases: Number(cases.rows[0] && cases.rows[0].count) || 0,
  };
}

export async function importAlgLibraryEntries(entries = []) {
  const normalizedEntries = mergeAlgLibraryEntries(Array.isArray(entries) ? entries.filter(Boolean) : []);
  try {
    const db = await getDatabase();

    await db.exec("BEGIN");
    for (const entry of normalizedEntries) {
      await db.query(
        `INSERT INTO alg_library_entries (
          id, piece_type, sheet_name, row_index, case_code, comm_notation, expanded_alg,
          description, alg, memo_word, category, notes, last_seen_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, timezone('utc', now())
        )
        ON CONFLICT (id) DO UPDATE SET
          piece_type = EXCLUDED.piece_type,
          sheet_name = EXCLUDED.sheet_name,
          row_index = EXCLUDED.row_index,
          case_code = EXCLUDED.case_code,
          comm_notation = EXCLUDED.comm_notation,
          expanded_alg = EXCLUDED.expanded_alg,
          description = EXCLUDED.description,
          alg = EXCLUDED.alg,
          memo_word = EXCLUDED.memo_word,
          category = EXCLUDED.category,
          notes = EXCLUDED.notes,
          last_seen_at = CASE
            WHEN alg_library_entries.last_seen_at IS NULL
              OR EXCLUDED.last_seen_at > alg_library_entries.last_seen_at THEN EXCLUDED.last_seen_at
            ELSE alg_library_entries.last_seen_at
          END,
          updated_at = timezone('utc', now())`,
        [
          String(entry.id),
          entry.piece_type || "unknown",
          entry.sheet_name || null,
          Number.isFinite(Number(entry.row_index)) ? Number(entry.row_index) : null,
          entry.case_code || "",
          entry.description || "",
          entry.alg || "",
          entry.description || "",
          entry.alg || "",
          entry.memo_word || null,
          entry.category || null,
          entry.notes || null,
          entry.last_seen_at || DEFAULT_ALG_LAST_SEEN_AT,
        ]
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    try {
      const db = await getDatabase();
      await db.exec("ROLLBACK");
    } catch (_rollbackError) {
      // Ignore rollback failures when the database itself is unavailable.
    }

    const currentEntries = readFallbackAlgLibraryEntries();
    const entriesById = new Map(currentEntries.map((entry) => [entry.id, entry]));
    normalizedEntries.forEach((entry) => {
      const normalizedEntry = normalizeAlgLibraryEntry(entry);
      if (normalizedEntry.id) {
        const existingEntry = entriesById.get(normalizedEntry.id);
        const existingLastSeenAt = existingEntry
          ? normalizeAlgLibraryEntry(existingEntry).last_seen_at
          : null;
        entriesById.set(normalizedEntry.id, {
          ...normalizedEntry,
          last_seen_at:
            existingLastSeenAt && existingLastSeenAt > normalizedEntry.last_seen_at
              ? existingLastSeenAt
              : normalizedEntry.last_seen_at,
        });
      }
    });
    writeFallbackAlgLibraryEntries([...entriesById.values()]);
  }
}

export async function replaceBundledAlgLibraryEntries(entries = []) {
  const normalizedEntries = mergeAlgLibraryEntries(Array.isArray(entries) ? entries.filter(Boolean) : []);
  try {
    const db = await getDatabase();
    await db.exec("BEGIN");
    const existingResult = await db.query(
      `SELECT piece_type, case_code, last_seen_at
       FROM alg_library_entries
       WHERE sheet_name LIKE $1`,
      ["bundled-%"]
    );
    const existingLastSeenByCase = new Map(
      (existingResult.rows || []).map((entry) => [
        `${entry.piece_type}:${entry.case_code}`,
        entry.last_seen_at || DEFAULT_ALG_LAST_SEEN_AT,
      ])
    );
    await db.query(`DELETE FROM alg_library_entries WHERE sheet_name LIKE $1`, ["bundled-%"]);
    for (const entry of normalizedEntries) {
      const preservedLastSeenAt =
        existingLastSeenByCase.get(`${entry.piece_type}:${entry.case_code}`) ||
        entry.last_seen_at ||
        DEFAULT_ALG_LAST_SEEN_AT;
      await db.query(
        `INSERT INTO alg_library_entries (
          id, piece_type, sheet_name, row_index, case_code, comm_notation, expanded_alg,
          description, alg, memo_word, category, notes, last_seen_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, timezone('utc', now())
        )`,
        [
          String(entry.id),
          entry.piece_type || "unknown",
          entry.sheet_name || null,
          Number.isFinite(Number(entry.row_index)) ? Number(entry.row_index) : null,
          entry.case_code || "",
          entry.description || "",
          entry.alg || "",
          entry.description || "",
          entry.alg || "",
          entry.memo_word || null,
          entry.category || null,
          entry.notes || null,
          preservedLastSeenAt,
        ]
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    try {
      const db = await getDatabase();
      await db.exec("ROLLBACK");
    } catch (_rollbackError) {
      // Ignore rollback failures when the database itself is unavailable.
    }

    const nonBundledEntries = readFallbackAlgLibraryEntries().filter(
      (entry) => !String(entry.sheet_name || "").startsWith("bundled-")
    );
    const existingBundledEntries = readFallbackAlgLibraryEntries().filter((entry) =>
      String(entry.sheet_name || "").startsWith("bundled-")
    );
    const existingLastSeenByCase = new Map(
      existingBundledEntries.map((entry) => [
        `${entry.piece_type}:${entry.case_code}`,
        entry.last_seen_at || DEFAULT_ALG_LAST_SEEN_AT,
      ])
    );
    const bundledEntries = normalizedEntries.map((entry) =>
      normalizeAlgLibraryEntry({
        ...entry,
        last_seen_at:
          existingLastSeenByCase.get(`${entry.piece_type}:${entry.case_code}`) ||
          entry.last_seen_at ||
          DEFAULT_ALG_LAST_SEEN_AT,
      })
    );
    writeFallbackAlgLibraryEntries([...nonBundledEntries, ...bundledEntries]);
  }
}

export async function getLocalAppMetaValue(key, fallbackValue = null) {
  try {
    const db = await getDatabase();
    const result = await db.query("SELECT value_json FROM app_meta WHERE key = $1", [key]);
    const row = result.rows && result.rows[0];
    return row ? safeJsonParse(row.value_json, fallbackValue) : fallbackValue;
  } catch (_error) {
    const meta = readFallbackAppMeta();
    return Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : fallbackValue;
  }
}

export async function setLocalAppMetaValue(key, value) {
  try {
    const db = await getDatabase();
    await db.query(
      `INSERT INTO app_meta (key, value_json, updated_at)
       VALUES ($1, $2, timezone('utc', now()))
       ON CONFLICT (key) DO UPDATE
       SET value_json = EXCLUDED.value_json,
           updated_at = timezone('utc', now())`,
      [key, JSON.stringify(value)]
    );
  } catch (_error) {
    const meta = readFallbackAppMeta();
    meta[key] = value;
    writeFallbackAppMeta(meta);
  }
}

export async function getAlgLibraryEntries(options = {}) {
  const pieceType = options.pieceType || "all";
  const rawSearch = typeof options.search === "string" ? options.search.trim() : "";
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 200;
  const searchPattern = rawSearch ? `%${rawSearch.toLowerCase()}%` : null;
  try {
    const db = await getDatabase();
    if (rawSearch) {
      const allResult = await db.query(
        `SELECT id, piece_type, sheet_name, row_index, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at
         FROM alg_library_entries
         WHERE ($1 = 'all' OR piece_type = $1)
         ORDER BY piece_type ASC, case_code ASC, row_index ASC NULLS LAST, updated_at DESC`,
        [pieceType]
      );
      const allEntries = allResult.rows || [];
      const matchingEntries = filterAlgLibraryEntries(allEntries, {
        pieceType: "all",
        search: rawSearch,
        limit: allEntries.length || 1,
      });
      return {
        totalCount: matchingEntries.length,
        entries: matchingEntries.slice(0, limit),
      };
    }

    const params = [pieceType, searchPattern, limit];
    const [countResult, entryResult] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM alg_library_entries
         WHERE ($1 = 'all' OR piece_type = $1)
           AND (
             $2 IS NULL
             OR LOWER(case_code) LIKE $2
             OR LOWER(description) LIKE $2
             OR LOWER(alg) LIKE $2
             OR LOWER(COALESCE(memo_word, '')) LIKE $2
             OR LOWER(COALESCE(category, '')) LIKE $2
             OR LOWER(COALESCE(notes, '')) LIKE $2
           )`,
        params.slice(0, 2)
      ),
      db.query(
        `SELECT id, piece_type, sheet_name, row_index, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at
         FROM alg_library_entries
         WHERE ($1 = 'all' OR piece_type = $1)
           AND (
             $2 IS NULL
             OR LOWER(case_code) LIKE $2
             OR LOWER(description) LIKE $2
             OR LOWER(alg) LIKE $2
             OR LOWER(COALESCE(memo_word, '')) LIKE $2
             OR LOWER(COALESCE(category, '')) LIKE $2
             OR LOWER(COALESCE(notes, '')) LIKE $2
           )
         ORDER BY piece_type ASC, case_code ASC, row_index ASC NULLS LAST, updated_at DESC
         LIMIT $3`,
        params
      ),
    ]);

    return {
      totalCount: Number(countResult.rows[0] && countResult.rows[0].count) || 0,
      entries: entryResult.rows || [],
    };
  } catch (_error) {
    const allEntries = readFallbackAlgLibraryEntries();
    const filteredEntries = filterAlgLibraryEntries(allEntries, {
      pieceType,
      search: rawSearch,
      limit,
    });
    return {
      totalCount: filterAlgLibraryEntries(allEntries, {
        pieceType,
        search: rawSearch,
        limit: allEntries.length || 1,
      }).length,
      entries: filteredEntries,
    };
  }
}

export async function updateAlgLibraryEntry(id, updates = {}) {
  const normalizedId = String(id || "");
  if (!normalizedId) {
    throw new Error("An alg library entry id is required.");
  }

  const fields = {
    description: typeof updates.description === "string" ? updates.description : "",
    alg: typeof updates.alg === "string" ? updates.alg : "",
    memo_word: typeof updates.memoWord === "string" ? updates.memoWord : "",
    category: typeof updates.category === "string" ? updates.category : "",
    notes: typeof updates.notes === "string" ? updates.notes : "",
  };
  try {
    const db = await getDatabase();
    const result = await db.query(
      `UPDATE alg_library_entries
       SET description = $2,
           alg = $3,
           memo_word = NULLIF($4, ''),
           category = NULLIF($5, ''),
           notes = NULLIF($6, ''),
           updated_at = timezone('utc', now())
       WHERE id = $1
       RETURNING id, piece_type, sheet_name, row_index, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at`,
      [normalizedId, fields.description, fields.alg, fields.memo_word || "", fields.category, fields.notes]
    );

    if (!result.rows || !result.rows.length) {
      throw new Error("The selected alg library entry could not be found.");
    }

    return result.rows[0];
  } catch (_error) {
    const entries = readFallbackAlgLibraryEntries();
    const entryIndex = entries.findIndex((entry) => entry.id === normalizedId);
    if (entryIndex < 0) {
      throw new Error("The selected alg library entry could not be found.");
    }

    const nextEntry = normalizeAlgLibraryEntry({
      ...entries[entryIndex],
      description: fields.description,
      alg: fields.alg,
      memo_word: fields.memo_word || null,
      category: fields.category || null,
      notes: fields.notes || null,
      updated_at: new Date().toISOString(),
    });
    entries[entryIndex] = nextEntry;
    writeFallbackAlgLibraryEntries(entries);
    return nextEntry;
  }
}

function normalizeAlgLibraryCaseRefs(caseRefs = []) {
  return Array.isArray(caseRefs)
    ? caseRefs
        .filter((entry) => entry && entry.caseCode && entry.pieceType)
        .map((entry) => ({
          pieceType: String(entry.pieceType),
          caseCode: String(entry.caseCode),
        }))
    : [];
}

function expandAlgLibraryCaseRefsForLookup(caseRefs = []) {
  const refs = [];
  const seenKeys = new Set();

  normalizeAlgLibraryCaseRefs(caseRefs).forEach((entry) => {
    getAlgLibraryCaseLookupCodes(entry.pieceType, entry.caseCode).forEach((caseCode) => {
      const key = `${entry.pieceType}:${caseCode}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        refs.push({ pieceType: entry.pieceType, caseCode });
      }
    });
  });

  return refs;
}

export async function getAlgLibraryEntriesForCases(caseRefs = []) {
  const normalizedRefs = expandAlgLibraryCaseRefsForLookup(caseRefs);

  if (!normalizedRefs.length) {
    return [];
  }
  try {
    const db = await getDatabase();
    const conditions = [];
    const params = [];
    normalizedRefs.forEach((entry, index) => {
      const base = index * 2;
      conditions.push(`(piece_type = $${base + 1} AND case_code = $${base + 2})`);
      params.push(entry.pieceType, entry.caseCode);
    });

    const result = await db.query(
      `SELECT id, piece_type, sheet_name, row_index, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at
       FROM alg_library_entries
       WHERE ${conditions.join(" OR ")}`,
      params
    );

    return result.rows || [];
  } catch (_error) {
    const keys = new Set(normalizedRefs.map((entry) => `${entry.pieceType}:${entry.caseCode}`));
    return readFallbackAlgLibraryEntries().filter((entry) =>
      keys.has(`${entry.piece_type}:${entry.case_code}`)
    );
  }
}

export async function markAlgLibraryEntriesSeen(caseRefs = [], seenAt = Date.now()) {
  const normalizedRefs = expandAlgLibraryCaseRefsForLookup(caseRefs);
  const uniqueRefs = [];
  const seenKeys = new Set();
  normalizedRefs.forEach((entry) => {
    const key = `${entry.pieceType}:${entry.caseCode}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRefs.push(entry);
    }
  });

  if (!uniqueRefs.length) {
    return [];
  }

  const seenAtIso = toIsoDate(seenAt, new Date().toISOString());
  try {
    const db = await getDatabase();
    const conditions = [];
    const params = [seenAtIso];
    uniqueRefs.forEach((entry, index) => {
      const base = index * 2 + 2;
      conditions.push(`(piece_type = $${base} AND case_code = $${base + 1})`);
      params.push(entry.pieceType, entry.caseCode);
    });

    const result = await db.query(
      `UPDATE alg_library_entries
       SET last_seen_at = $1
       WHERE ${conditions.join(" OR ")}
       RETURNING id, piece_type, sheet_name, row_index, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at`,
      params
    );

    return result.rows || [];
  } catch (_error) {
    const keys = new Set(uniqueRefs.map((entry) => `${entry.pieceType}:${entry.caseCode}`));
    const entries = readFallbackAlgLibraryEntries();
    const updatedEntries = [];
    const nextEntries = entries.map((entry) => {
      if (!keys.has(`${entry.piece_type}:${entry.case_code}`)) {
        return entry;
      }

      const nextEntry = normalizeAlgLibraryEntry({
        ...entry,
        last_seen_at: seenAtIso,
      });
      updatedEntries.push(nextEntry);
      return nextEntry;
    });
    writeFallbackAlgLibraryEntries(nextEntries);
    return updatedEntries;
  }
}

export async function getAlgLibrarySummary(limit = 6) {
  try {
    const db = await getDatabase();
    const [countResult, recentResult, memoCountResult] = await Promise.all([
      db.query(
        `SELECT piece_type, COUNT(*)::int AS count
         FROM alg_library_entries
         GROUP BY piece_type
         ORDER BY piece_type ASC`
      ),
      db.query(
        `SELECT id, piece_type, case_code, description, alg, memo_word, category, notes, last_seen_at, updated_at
         FROM alg_library_entries
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT piece_type, COUNT(*)::int AS count
         FROM alg_library_entries
         WHERE COALESCE(memo_word, '') <> ''
         GROUP BY piece_type
         ORDER BY piece_type ASC`
      ),
    ]);

    return {
      counts: countResult.rows || [],
      recentEntries: recentResult.rows || [],
      memoCounts: memoCountResult.rows || [],
    };
  } catch (_error) {
    const entries = readFallbackAlgLibraryEntries();
    const countsByPieceType = entries.reduce((acc, entry) => {
      const pieceType = entry.piece_type || "unknown";
      acc[pieceType] = (acc[pieceType] || 0) + 1;
      return acc;
    }, {});
    const memoCountsByPieceType = entries.reduce((acc, entry) => {
      if (!entry.memo_word) {
        return acc;
      }
      const pieceType = entry.piece_type || "unknown";
      acc[pieceType] = (acc[pieceType] || 0) + 1;
      return acc;
    }, {});
    const counts = Object.keys(countsByPieceType)
      .sort((a, b) => a.localeCompare(b))
      .map((pieceType) => ({ piece_type: pieceType, count: countsByPieceType[pieceType] }));
    const memoCounts = Object.keys(memoCountsByPieceType)
      .sort((a, b) => a.localeCompare(b))
      .map((pieceType) => ({ piece_type: pieceType, count: memoCountsByPieceType[pieceType] }));
    const recentEntries = [...entries]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, limit);

    return {
      counts,
      recentEntries,
      memoCounts,
    };
  }
}
