# Legacy and experimental components

JBLD began as a server-backed project and later moved parsing and storage into the browser. The earlier implementations remain in the repository because they show that evolution and may still be useful as reference, but they are not part of the current GitHub Pages application.

This page separates code that exists from code that is deployed and maintained as the primary path.

## Status summary

| Component | Status | Relationship to the current app |
| --- | --- | --- |
| Python parser and Flask API (`server/`) | Legacy reference implementation | Frontend compatibility hooks remain, but GitHub Pages has no API service and uses the browser parser |
| PostgreSQL and server persistence (`database/`, `server/solve_store.py`) | Legacy | Stores server sessions and solves; unrelated to the current PGlite browser database |
| Docker Compose and Nginx (`docker-compose.yml`, `nginx/`) | Legacy deployment definition | Describes the former multi-container topology; not built or tested by current CI |
| Supabase sync (`website/src/utils/supabaseSync.js`) | Dormant prototype | Imported by the frontend but called only when `isSupabaseConfigured()` passes; production provides no credentials |
| Supabase schema (`website/supabase_schema.sql`) | Prototype only | Uses anonymous read/write policies and is not suitable for a shared production service as written |
| Desktop BLE bridge (`bridge/`) | Incomplete experiment | Not used by the browser connection flow and cannot be installed from the checked-in package manifest without repair |

## Python parser and Web API

The original parser in [`server/BLD_Parser.py`](../server/BLD_Parser.py) models the cube as sticker permutations. [`server/flask_analyze_server.py`](../server/flask_analyze_server.py) exposes it through `/parse`, with additional session and solve routes backed by PostgreSQL.

The current frontend still probes `/options` and contains request methods for `/parse` and `/api/...`. On a page served from port `8080`, that compatibility code targets port `8082`; otherwise it uses the page origin. When the probe fails, the frontend calls the local parser. The GitHub Pages deployment has no matching service, so local parsing is the effective production path.

Important limitations before this service could be restored:

- request settings are written to process-wide environment variables, which requires refactoring for safe concurrent use;
- the server path is not exercised by the current JavaScript tests or Pages workflow;
- `server/runtime.txt` specifies Python 3.6.14 while `server/Dockerfile` uses Python 3.9;
- database credentials and schema management belong to the old deployment model;
- the browser and Python parsers have evolved independently and should not be assumed to produce identical results.

The implemented routes and file map are documented in the [server README](../server/README.md).

## PostgreSQL, Docker, and Nginx

[`docker-compose.yml`](../docker-compose.yml) describes five services: a front Nginx proxy, a React/Nginx image, Flask, PostgreSQL, and Adminer. It retains `trainbld_*` service names because it predates the JBLD name.

This stack should be treated as an architectural record, not a current quick-start command:

- the current deployment workflow never builds it;
- the frontend Dockerfile uses Node 14 and `npm install`, while current CI uses Node 22 and `npm ci --legacy-peer-deps`;
- the Nginx configuration still names the former TrainBLD domain;
- dependency images are not pinned consistently;
- there is no current integration test covering the complete stack.

The PostgreSQL schema stores server-side sessions and solves. It is separate from the PGlite schema that the browser creates in IndexedDB.

## Supabase prototype

[`website/src/utils/supabaseSync.js`](../website/src/utils/supabaseSync.js) implements REST-based merging of session and solve rows. It is guarded by `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`; when either is missing, the functions return without contacting Supabase.

The checked-in production environment does not define those variables, and the Pages workflow does not inject them. Supabase is therefore not part of the deployed application.

[`website/supabase_schema.sql`](../website/supabase_schema.sql) enables row-level security but grants anonymous clients unrestricted row access. Anyone reviving this work should add authentication, bind rows to users, and replace those policies before placing real user data in a shared project.

## Desktop BLE bridge

[`bridge/index.js`](../bridge/index.js) explores reading GAN cube moves through a Node BLE backend and broadcasting them to a local WebSocket server. The current PWA connects through Web Bluetooth and does not start or contact this bridge.

The checked-in [`bridge/package.json`](../bridge/package.json) contains placeholder versions (`^x.y.z`) and does not fully declare the native Noble dependencies used by the source. It is intentionally documented as incomplete until its dependencies, supported platforms, and connection path are made reproducible and tested.

## If one of these paths is revived

Treat it as a new implementation task rather than assuming the old setup is production-ready:

1. define the use case that the browser-only architecture cannot meet;
2. update and pin the runtime and dependencies;
3. add automated tests for the restored boundary;
4. replace shared process configuration and anonymous database access;
5. document how it is deployed and how data ownership differs from local PGlite storage;
6. update this status page when the restored path becomes part of the supported application.
