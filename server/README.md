# Legacy Python parser and API

> Status: retained for reference. The current CI and GitHub Pages deployment do not build, run, or test this service.

The `server/` folder contains the original permutation-based solve parser behind a Flask API. It can reconstruct solves, generate text and CubeDB output, calculate parser metrics, and persist sessions in PostgreSQL.

The React PWA now performs parsing and persistence in the browser. It still contains compatibility hooks for this API, but the GitHub Pages deployment has no server endpoint and uses the local parser.

## Request flow

1. `flask_analyze_server.py` receives JSON and maps solve settings into the process environment expected by the original parser.
2. `BLD_Parser.py` applies the scramble and recorded moves to a sticker permutation.
3. Changes in cube state are used to identify commutator boundaries and classify edges, corners, parity, flips, twists, and mistakes.
4. The parser emits a human-readable reconstruction and an optional CubeDB URL.
5. `DB_LOGS.py` calculates aggregate metrics, while `solve_store.py` writes normalized session, solve, commutator, and move rows to PostgreSQL when configured.

## Implemented endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/parse` | Parse a solve payload and optionally persist it when `SAVE_SOLVE` is enabled |
| `OPTIONS` | `/options` | Capability and CORS probe used by the retained frontend compatibility code |
| `GET` | `/api/sessions?user_id=...` | Load a user's sessions and solve summaries |
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/solves/<solve_id>?user_id=...` | Load one persisted solve with commutator and move details |

## Main files

| Path | Purpose |
| --- | --- |
| [`flask_analyze_server.py`](flask_analyze_server.py) | Flask routes and request adapter |
| [`BLD_Parser.py`](BLD_Parser.py) | Cube permutation, solve segmentation, case classification, timings, and reconstruction output |
| [`bld_comm_parser.py`](bld_comm_parser.py) | Expansion and simplification of commutator notation |
| [`DB_LOGS.py`](DB_LOGS.py) | Solve metrics and request logging |
| [`solve_store.py`](solve_store.py) | PostgreSQL schema and normalized session/solve persistence |
| [`example_solves/`](example_solves/) | Historical parser input examples |

## Why this is not the current path

- The current deployment workflow builds only `website/` and publishes static files to GitHub Pages.
- Browser parsing avoids a network round trip and keeps solve data local.
- The request adapter changes process-wide environment variables for each solve, reflecting the parser's command-line origins. That design is not safe for concurrent requests without refactoring.
- The server dependencies and execution path are not covered by the current frontend test or deployment workflow.
- [`runtime.txt`](runtime.txt) records Python 3.6.14, while [`Dockerfile`](Dockerfile) uses Python 3.9; this version drift should be resolved before reviving the service.

The repository-level Compose, PostgreSQL, and Nginx files describe the intended historical topology. They are not presented as a verified setup for the current application.

See [Legacy and experimental components](../docs/LEGACY.md) for the wider status of the API, database, Docker, Supabase, and BLE bridge code.
