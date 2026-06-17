const DATABASE_PATH = "idb://jbld-local-db";
const SCHEMA_VERSION = 3;

let dbPromise = null;
let migrationPromise = null;

function resolvePGliteConstructor(moduleExports) {
  if (!moduleExports) {
    return null;
  }

  if (typeof moduleExports === "function") {
    return moduleExports;
  }

  if (typeof moduleExports.PGlite === "function") {
    return moduleExports.PGlite;
  }

  if (moduleExports.default) {
    return resolvePGliteConstructor(moduleExports.default);
  }

  return null;
}

async function loadPGliteConstructor() {
  if (typeof require === "function") {
    const moduleExports = require("@electric-sql/pglite/dist/index.cjs");
    const PGliteConstructor = resolvePGliteConstructor(moduleExports);
    if (PGliteConstructor) {
      return PGliteConstructor;
    }
  }

  throw new Error("PGlite could not be loaded in this browser.");
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

function splitMoves(algText = "") {
  return String(algText)
    .trim()
    .split(/\s+/)
    .map((move) => move.trim())
    .filter(Boolean);
}

function toIsoDate(value, fallback = new Date().toISOString()) {
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
      category TEXT,
      notes TEXT,
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
      ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE IF EXISTS alg_library_entries
      ADD COLUMN IF NOT EXISTS notes TEXT;

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
  const db = await getDatabase();
  const normalizedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];

  await db.exec("BEGIN");
  try {
    for (const entry of normalizedEntries) {
      await db.query(
        `INSERT INTO alg_library_entries (
          id, piece_type, sheet_name, row_index, case_code, comm_notation, expanded_alg,
          description, alg, category, notes, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, timezone('utc', now())
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
          category = EXCLUDED.category,
          notes = EXCLUDED.notes,
          updated_at = timezone('utc', now())`,
        [
          String(entry.id),
          entry.pieceType || "unknown",
          entry.sheetName || null,
          Number.isFinite(Number(entry.rowIndex)) ? Number(entry.rowIndex) : null,
          entry.caseCode || "",
          entry.description || entry.notation || "",
          entry.alg || entry.expandedAlg || "",
          entry.description || entry.notation || "",
          entry.alg || entry.expandedAlg || "",
          entry.category || null,
          entry.notes || null,
        ]
      );
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function replaceBundledAlgLibraryEntries(entries = []) {
  const db = await getDatabase();
  await db.exec("BEGIN");
  try {
    await db.query(`DELETE FROM alg_library_entries WHERE sheet_name LIKE $1`, ["bundled-%"]);
    for (const entry of Array.isArray(entries) ? entries.filter(Boolean) : []) {
      await db.query(
        `INSERT INTO alg_library_entries (
          id, piece_type, sheet_name, row_index, case_code, comm_notation, expanded_alg,
          description, alg, category, notes, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, timezone('utc', now())
        )`,
        [
          String(entry.id),
          entry.pieceType || "unknown",
          entry.sheetName || null,
          Number.isFinite(Number(entry.rowIndex)) ? Number(entry.rowIndex) : null,
          entry.caseCode || "",
          entry.description || entry.notation || "",
          entry.alg || entry.expandedAlg || "",
          entry.description || entry.notation || "",
          entry.alg || entry.expandedAlg || "",
          entry.category || null,
          entry.notes || null,
        ]
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function getLocalAppMetaValue(key, fallbackValue = null) {
  const db = await getDatabase();
  const result = await db.query("SELECT value_json FROM app_meta WHERE key = $1", [key]);
  const row = result.rows && result.rows[0];
  return row ? safeJsonParse(row.value_json, fallbackValue) : fallbackValue;
}

export async function setLocalAppMetaValue(key, value) {
  const db = await getDatabase();
  await db.query(
    `INSERT INTO app_meta (key, value_json, updated_at)
     VALUES ($1, $2, timezone('utc', now()))
     ON CONFLICT (key) DO UPDATE
     SET value_json = EXCLUDED.value_json,
         updated_at = timezone('utc', now())`,
    [key, JSON.stringify(value)]
  );
}

export async function getAlgLibrarySummary(limit = 6) {
  const db = await getDatabase();
  const [countResult, recentResult] = await Promise.all([
    db.query(
      `SELECT piece_type, COUNT(*)::int AS count
       FROM alg_library_entries
       GROUP BY piece_type
       ORDER BY piece_type ASC`
    ),
    db.query(
      `SELECT id, piece_type, case_code, description, alg, category, notes, updated_at
       FROM alg_library_entries
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    ),
  ]);

  return {
    counts: countResult.rows || [],
    recentEntries: recentResult.rows || [],
  };
}
