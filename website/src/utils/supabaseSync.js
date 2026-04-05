const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

const sessionTable = "jbld_sessions";
const solveTable = "jbld_solves";

function getHeaders(prefer = null) {
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...getHeaders(options.prefer || null),
      ...(options.headers || {}),
    },
  });

  const rawBody = await response.text();
  let data = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch (_error) {
      data = rawBody;
    }
  }

  if (!response.ok) {
    throw new Error(
      data && data.message
        ? data.message
        : data && data.error
          ? data.error
          : `Supabase request failed with status ${response.status}`
    );
  }

  return data;
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

function toSessionRow(session, userKey) {
  return {
    id: String(session.id),
    user_key: userKey,
    name: session.name || "Session",
    puzzle_type: session.puzzleType || "3x3 BLD",
    scramble_type: session.scrambleType || "3x3",
    created_at: toIsoDate(session.createdAt),
    updated_at: toIsoDate(session.updatedAt || session.createdAt),
  };
}

function toSolveRow(solve, userKey, sessionId) {
  return {
    id: String(solve.id),
    user_key: userKey,
    session_id: String(sessionId),
    recorded_at: toIsoDate(solve.date),
    updated_at: toIsoDate(solve.updatedAt || solve.date),
    time_solve: solve.time_solve,
    memo_time: solve.memo_time,
    exe_time: solve.exe_time,
    fluidness: solve.fluidness,
    dnf: Boolean(solve.DNF),
    scramble: solve.scramble || "",
    solve_alg: solve.solve || "",
    txt_solve: solve.txt_solve || "",
    link: solve.link || null,
    parse_error: solve.parseError || null,
    comm_stats: Array.isArray(solve.comm_stats) ? solve.comm_stats : [],
    move_timeline: Array.isArray(solve.move_timeline) ? solve.move_timeline : [],
  };
}

function fromSolveRow(row) {
  return {
    id: row.id,
    date: row.recorded_at ? new Date(row.recorded_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    time_solve: row.time_solve,
    memo_time: row.memo_time,
    exe_time: row.exe_time,
    fluidness: row.fluidness,
    DNF: Boolean(row.dnf),
    scramble: row.scramble || "",
    solve: row.solve_alg || "",
    txt_solve: row.txt_solve || "",
    link: row.link || null,
    comm_stats: Array.isArray(row.comm_stats) ? row.comm_stats : [],
    move_timeline: Array.isArray(row.move_timeline) ? row.move_timeline : [],
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
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    solves: (solvesBySessionId[row.id] || []).sort((a, b) => (a.date || 0) - (b.date || 0)),
  }));
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function fetchSupabaseDataset(userKey) {
  const [sessions, solves] = await Promise.all([
    supabaseRest(
      `${sessionTable}?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=created_at.asc`,
      { method: "GET" }
    ),
    supabaseRest(
      `${solveTable}?user_key=eq.${encodeURIComponent(userKey)}&select=*&order=recorded_at.asc`,
      { method: "GET" }
    ),
  ]);

  return fromSessionRows(sessions, solves);
}

export async function fetchSupabaseSolveById(userKey, solveId) {
  const rows = await supabaseRest(
    `${solveTable}?user_key=eq.${encodeURIComponent(userKey)}&id=eq.${encodeURIComponent(
      solveId
    )}&select=*`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length ? fromSolveRow(rows[0]) : null;
}

export async function syncSupabaseDataset(userKey, sessions) {
  const sessionRows = (Array.isArray(sessions) ? sessions : []).map((session) => toSessionRow(session, userKey));
  const solveRows = (Array.isArray(sessions) ? sessions : []).flatMap((session) =>
    (Array.isArray(session.solves) ? session.solves : []).map((solve) => toSolveRow(solve, userKey, session.id))
  );

  if (sessionRows.length) {
    await supabaseRest(sessionTable, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify(sessionRows),
    });
  }

  if (solveRows.length) {
    await supabaseRest(solveTable, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify(solveRows),
    });
  }
}
