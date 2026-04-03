import json
import os
from datetime import datetime

import psycopg2
from psycopg2.extras import Json, RealDictCursor

from DB_LOGS import calc_pauses, process_solve_stats, solve_length, total_algs as count_total_algs, convert_to_num

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS SESSIONS (
    SESSION_ID SERIAL PRIMARY KEY,
    USER_ID TEXT NOT NULL,
    NAME TEXT NOT NULL,
    PUZZLE_TYPE TEXT DEFAULT '3x3 BLD',
    SCRAMBLE_TYPE TEXT DEFAULT '3x3',
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS IDX_SESSIONS_USER_UPDATED
    ON SESSIONS (USER_ID, UPDATED_AT DESC);

CREATE TABLE IF NOT EXISTS SOLVES (
    SOLVE_ID SERIAL PRIMARY KEY,
    SESSION_ID INTEGER NOT NULL REFERENCES SESSIONS(SESSION_ID) ON DELETE CASCADE,
    USER_ID TEXT NOT NULL,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    SOLVE_TIME NUMERIC,
    EXE NUMERIC,
    MEMO NUMERIC,
    FLUIDNESS NUMERIC,
    SUCCESS BOOLEAN,
    DNF BOOLEAN DEFAULT FALSE,
    PARSED_TXT TEXT,
    PARSED_URL TEXT,
    SCRAMBLE TEXT,
    SOLVE_TEXT TEXT,
    REQUEST_JSON JSONB,
    SOLVE_METADATA JSONB,
    TOTAL_MOVES NUMERIC,
    TOTAL_ALGS NUMERIC,
    TPS NUMERIC,
    TOTAL_PAUSES NUMERIC
);

CREATE INDEX IF NOT EXISTS IDX_SOLVES_SESSION_CREATED
    ON SOLVES (SESSION_ID, CREATED_AT DESC);

CREATE INDEX IF NOT EXISTS IDX_SOLVES_USER_CREATED
    ON SOLVES (USER_ID, CREATED_AT DESC);

CREATE TABLE IF NOT EXISTS SOLVE_COMMS (
    COMM_ID SERIAL PRIMARY KEY,
    SOLVE_ID INTEGER NOT NULL REFERENCES SOLVES(SOLVE_ID) ON DELETE CASCADE,
    COMM_INDEX INTEGER NOT NULL,
    COMM_PHASE TEXT NOT NULL,
    BUFFER_TARGET TEXT,
    TARGET_A TEXT,
    TARGET_B TEXT,
    SPECIAL_TYPE TEXT,
    PIECE_TYPE TEXT,
    RECOG_TIME NUMERIC,
    EXEC_TIME NUMERIC,
    ALG TEXT,
    ALG_LENGTH INTEGER,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS IDX_SOLVE_COMMS_SOLVE_INDEX
    ON SOLVE_COMMS (SOLVE_ID, COMM_INDEX);

CREATE TABLE IF NOT EXISTS SOLVE_MOVES (
    MOVE_ID SERIAL PRIMARY KEY,
    SOLVE_ID INTEGER NOT NULL REFERENCES SOLVES(SOLVE_ID) ON DELETE CASCADE,
    MOVE_INDEX INTEGER NOT NULL,
    NOTATION TEXT,
    TIME_OFFSET NUMERIC,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS IDX_SOLVE_MOVES_SOLVE_INDEX
    ON SOLVE_MOVES (SOLVE_ID, MOVE_INDEX);
"""


def get_db_connection():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST"),
    )


def ensure_schema(conn):
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()


def serialize_comm_entry(entry, phase, index):
    comm = entry.get("comm") or ["", "", ""]
    special_type = None
    if len(comm) > 2 and comm[2] in ("flip", "twist"):
        special_type = comm[2]

    return {
        "comm_index": index,
        "comm_phase": phase,
        "buffer_target": comm[0] if len(comm) > 0 else None,
        "target_a": comm[1] if len(comm) > 1 else None,
        "target_b": comm[2] if len(comm) > 2 else None,
        "special_type": special_type,
        "piece_type": phase,
        "recog_time": entry.get("recog"),
        "exec_time": entry.get("exe"),
        "alg": entry.get("alg"),
        "alg_length": entry.get("alg_length"),
    }


def flatten_comm_rows(metadata):
    if metadata.get("comm_events"):
        return [
            serialize_comm_entry(entry, entry.get("phase") or entry.get("piece_type") or "unknown", index + 1)
            for index, entry in enumerate(metadata["comm_events"])
        ]

    comm_rows = []
    index = 0

    for entry in metadata.get("edge_comms", []):
        index += 1
        comm_rows.append(serialize_comm_entry(entry, "edge", index))

    for entry in metadata.get("corner_comms", []):
        index += 1
        comm_rows.append(serialize_comm_entry(entry, "corner", index))

    if metadata.get("parity"):
        index += 1
        comm_rows.append(serialize_comm_entry(metadata["parity"], "parity", index))

    return comm_rows


def get_or_create_default_session(cur, user_id, scramble_type="3x3"):
    cur.execute(
        """
        SELECT SESSION_ID, USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE, CREATED_AT, UPDATED_AT
        FROM SESSIONS
        WHERE USER_ID = %s
        ORDER BY UPDATED_AT DESC, SESSION_ID DESC
        LIMIT 1
        """,
        (user_id,),
    )
    existing = cur.fetchone()
    if existing:
        return existing

    cur.execute(
        """
        INSERT INTO SESSIONS (USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE)
        VALUES (%s, %s, %s, %s)
        RETURNING SESSION_ID, USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE, CREATED_AT, UPDATED_AT
        """,
        (user_id, "Session 1", "3x3 BLD", scramble_type),
    )
    return cur.fetchone()


def create_session(user_id, name, puzzle_type="3x3 BLD", scramble_type="3x3"):
    with get_db_connection() as conn:
        ensure_schema(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO SESSIONS (USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE)
                VALUES (%s, %s, %s, %s)
                RETURNING SESSION_ID, USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE, CREATED_AT, UPDATED_AT
                """,
                (user_id, name, puzzle_type, scramble_type),
            )
            return normalize_session_row(cur.fetchone())


def normalize_comm_row(row):
    return {
        "id": row["comm_id"],
        "index": row["comm_index"],
        "phase": row["comm_phase"],
        "buffer_target": row["buffer_target"],
        "target_a": row["target_a"],
        "target_b": row["target_b"],
        "special_type": row["special_type"],
        "piece_type": row["piece_type"],
        "recog_time": float(row["recog_time"]) if row["recog_time"] is not None else None,
        "exec_time": float(row["exec_time"]) if row["exec_time"] is not None else None,
        "alg": row["alg"],
        "alg_length": int(row["alg_length"]) if row["alg_length"] is not None else None,
    }


def normalize_solve_row(row):
    metadata = row["solve_metadata"] if isinstance(row["solve_metadata"], dict) else {}
    return {
        "id": row["solve_id"],
        "session_id": row["session_id"],
        "user_id": row["user_id"],
        "date": row["created_at"].isoformat() if row["created_at"] else None,
        "time_solve": float(row["solve_time"]) if row["solve_time"] is not None else None,
        "memo_time": float(row["memo"]) if row["memo"] is not None else None,
        "exe_time": float(row["exe"]) if row["exe"] is not None else None,
        "fluidness": float(row["fluidness"]) if row["fluidness"] is not None else None,
        "success": row["success"],
        "DNF": row["dnf"],
        "txt_solve": row["parsed_txt"],
        "link": row["parsed_url"],
        "scramble": row["scramble"],
        "solve": row["solve_text"],
        "metadata": metadata,
        "comm_stats": [],
        "move_timeline": [],
        "totals": {
            "moves": float(row["total_moves"]) if row["total_moves"] is not None else None,
            "algs": float(row["total_algs"]) if row["total_algs"] is not None else None,
            "tps": float(row["tps"]) if row["tps"] is not None else None,
            "pauses": float(row["total_pauses"]) if row["total_pauses"] is not None else None,
        },
    }


def normalize_session_row(row):
    return {
        "id": row["session_id"],
        "user_id": row["user_id"],
        "name": row["name"],
        "puzzle_type": row["puzzle_type"],
        "scramble_type": row["scramble_type"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def normalize_move_row(row):
    return {
        "id": row["move_id"],
        "index": row["move_index"],
        "notation": row["notation"],
        "time_offset": float(row["time_offset"]) if row["time_offset"] is not None else None,
    }


def fetch_sessions_with_solves(user_id, solve_limit=50):
    with get_db_connection() as conn:
        ensure_schema(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT SESSION_ID, USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE, CREATED_AT, UPDATED_AT
                FROM SESSIONS
                WHERE USER_ID = %s
                ORDER BY UPDATED_AT DESC, SESSION_ID DESC
                """,
                (user_id,),
            )
            sessions = [normalize_session_row(row) for row in cur.fetchall()]

            for session in sessions:
                cur.execute(
                    """
                    SELECT *
                    FROM SOLVES
                    WHERE SESSION_ID = %s
                    ORDER BY CREATED_AT DESC, SOLVE_ID DESC
                    LIMIT %s
                    """,
                    (session["id"], solve_limit),
                )
                solve_rows = cur.fetchall()
                solves = [normalize_solve_row(row) for row in reversed(solve_rows)]

                if solves:
                    solve_ids = [solve["id"] for solve in solves]
                    cur.execute(
                        """
                        SELECT *
                        FROM SOLVE_COMMS
                        WHERE SOLVE_ID = ANY(%s)
                        ORDER BY SOLVE_ID ASC, COMM_INDEX ASC
                        """,
                        (solve_ids,),
                    )
                    comm_rows = cur.fetchall()
                    comms_by_solve = {}
                    for row in comm_rows:
                        comms_by_solve.setdefault(row["solve_id"], []).append(normalize_comm_row(row))

                    for solve in solves:
                        solve["comm_stats"] = comms_by_solve.get(solve["id"], [])

                session["solves"] = solves

            return sessions


def fetch_solve_detail(user_id, solve_id):
    with get_db_connection() as conn:
        ensure_schema(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT *
                FROM SOLVES
                WHERE SOLVE_ID = %s AND USER_ID = %s
                """,
                (solve_id, user_id),
            )
            solve_row = cur.fetchone()
            if not solve_row:
                return None

            solve = normalize_solve_row(solve_row)
            solve["comm_stats"] = [normalize_comm_row(row) for row in fetch_comm_rows(cur, solve_id)]
            solve["move_timeline"] = [normalize_move_row(row) for row in fetch_move_rows(cur, solve_id)]
            return solve


def build_move_rows(post_data):
    solve_text = (post_data.get("SOLVE") or "").strip()
    move_tokens = solve_text.split() if solve_text else []

    raw_offsets = post_data.get("SOLVE_TIME_MOVES")
    try:
        offsets = json.loads(raw_offsets) if raw_offsets else []
    except Exception:
        offsets = []

    move_rows = []
    max_len = max(len(move_tokens), len(offsets))
    for index in range(max_len):
        move_rows.append(
            {
                "move_index": index + 1,
                "notation": move_tokens[index] if index < len(move_tokens) else None,
                "time_offset": offsets[index] if index < len(offsets) else None,
            }
        )

    return move_rows


def save_parsed_solve(post_data, cube, parsed_response):
    user_id = post_data.get("ID") or "anonymous"
    requested_session_id = post_data.get("SESSION_ID")
    scramble_type = post_data.get("SCRAMBLE_TYPE") or "3x3"
    metadata = process_solve_stats(cube.solve_stats, cube.moves_time)
    total_moves = solve_length(metadata)
    total_pauses = calc_pauses(metadata)
    total_algs = count_total_algs(metadata)
    exe_time = convert_to_num(cube.exe_time)
    turns_per_second = round(total_moves / exe_time, 2) if exe_time not in (None, 0) else None

    with get_db_connection() as conn:
        ensure_schema(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            session = None
            requested_session_id_int = None
            if requested_session_id not in (None, ""):
                try:
                    requested_session_id_int = int(requested_session_id)
                except (TypeError, ValueError):
                    requested_session_id_int = None

            if requested_session_id_int is not None:
                cur.execute(
                    """
                    SELECT SESSION_ID, USER_ID, NAME, PUZZLE_TYPE, SCRAMBLE_TYPE, CREATED_AT, UPDATED_AT
                    FROM SESSIONS
                    WHERE SESSION_ID = %s AND USER_ID = %s
                    """,
                    (requested_session_id_int, user_id),
                )
                session = cur.fetchone()

            if session is None:
                session = get_or_create_default_session(cur, user_id, scramble_type)

            now = datetime.utcnow()
            parsed_txt = parsed_response.get("txt") if isinstance(parsed_response, dict) else None
            parsed_url = parsed_response.get("cubedb") if isinstance(parsed_response, dict) else None

            cur.execute(
                """
                INSERT INTO SOLVES (
                    SESSION_ID,
                    USER_ID,
                    CREATED_AT,
                    SOLVE_TIME,
                    EXE,
                    MEMO,
                    FLUIDNESS,
                    SUCCESS,
                    DNF,
                    PARSED_TXT,
                    PARSED_URL,
                    SCRAMBLE,
                    SOLVE_TEXT,
                    REQUEST_JSON,
                    SOLVE_METADATA,
                    TOTAL_MOVES,
                    TOTAL_ALGS,
                    TPS,
                    TOTAL_PAUSES
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    session["session_id"],
                    user_id,
                    now,
                    convert_to_num(cube.time_solve),
                    exe_time,
                    convert_to_num(cube.memo_time),
                    cube.fluidness,
                    cube.success,
                    not cube.success,
                    parsed_txt,
                    parsed_url,
                    post_data.get("SCRAMBLE"),
                    post_data.get("SOLVE"),
                    Json(post_data),
                    Json(metadata),
                    total_moves,
                    total_algs,
                    turns_per_second,
                    total_pauses,
                ),
            )
            solve_row = cur.fetchone()

            comm_rows = flatten_comm_rows(metadata)
            for comm in comm_rows:
                cur.execute(
                    """
                    INSERT INTO SOLVE_COMMS (
                        SOLVE_ID,
                        COMM_INDEX,
                        COMM_PHASE,
                        BUFFER_TARGET,
                        TARGET_A,
                        TARGET_B,
                        SPECIAL_TYPE,
                        PIECE_TYPE,
                        RECOG_TIME,
                        EXEC_TIME,
                        ALG,
                        ALG_LENGTH
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        solve_row["solve_id"],
                        comm["comm_index"],
                        comm["comm_phase"],
                        comm["buffer_target"],
                        comm["target_a"],
                        comm["target_b"],
                        comm["special_type"],
                        comm["piece_type"],
                        comm["recog_time"],
                        comm["exec_time"],
                        comm["alg"],
                        comm["alg_length"],
                    ),
                )

            for move in build_move_rows(post_data):
                cur.execute(
                    """
                    INSERT INTO SOLVE_MOVES (
                        SOLVE_ID,
                        MOVE_INDEX,
                        NOTATION,
                        TIME_OFFSET
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        solve_row["solve_id"],
                        move["move_index"],
                        move["notation"],
                        move["time_offset"],
                    ),
                )

            cur.execute(
                """
                UPDATE SESSIONS
                SET UPDATED_AT = %s, SCRAMBLE_TYPE = %s
                WHERE SESSION_ID = %s
                """,
                (now, scramble_type, session["session_id"]),
            )

            normalized_session = normalize_session_row(session)
            normalized_session["updated_at"] = now.isoformat()
            normalized_solve = normalize_solve_row(solve_row)
            normalized_solve["comm_stats"] = [normalize_comm_row(row) for row in fetch_comm_rows(cur, solve_row["solve_id"])]
            return {
                "session": normalized_session,
                "solve": normalized_solve,
            }


def fetch_comm_rows(cur, solve_id):
    cur.execute(
        """
        SELECT *
        FROM SOLVE_COMMS
        WHERE SOLVE_ID = %s
        ORDER BY COMM_INDEX ASC
        """,
        (solve_id,),
    )
    return cur.fetchall()


def fetch_move_rows(cur, solve_id):
    cur.execute(
        """
        SELECT *
        FROM SOLVE_MOVES
        WHERE SOLVE_ID = %s
        ORDER BY MOVE_INDEX ASC
        """,
        (solve_id,),
    )
    return cur.fetchall()
