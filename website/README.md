# JBLD web application

This folder contains the current JBLD application: a React PWA that records blindfolded solves, reconstructs them locally, and stores the resulting training data in the browser.

Start with the [project overview](../README.md), then read the [concept guide](../docs/CONCEPTS.md) and [architecture guide](../docs/ARCHITECTURE.md) for the reasoning behind the parser.

## Current runtime

The deployed application is browser-only:

- the commutator parser and recommended-solve generator run locally;
- PGlite stores the main dataset in IndexedDB;
- `localStorage` holds settings, small caches, and migration data;
- the service worker caches the production application for offline use;
- GitHub Pages serves the static build.

No Python service, Web API, PostgreSQL server, or Supabase project is part of the current deployment. Compatibility code for the earlier API and Supabase prototype remains in the source and is described in [Legacy and experimental components](../docs/LEGACY.md).

## Responsibilities

The web app owns the main user workflow:

- timer and scramble generation;
- Bluetooth smart-cube connections and timestamped move capture;
- orientation-aware cube replay and commutator segmentation;
- recommended memo and solve generation with selectable cycle breaks;
- solve reconstruction, DNF review, history, sessions, and statistics;
- algorithm-library search, editing, CSV/XLSX import, and workbook export;
- practice and algorithm-review queues;
- local-first persistence;
- installable and offline PWA behaviour.

## Important modules

| Path | Purpose |
| --- | --- |
| [`src/App.jsx`](src/App.jsx) | Application state, views, smart-cube adapters, solve lifecycle, and feature orchestration |
| [`src/utils/localCommParser.js`](src/utils/localCommParser.js) | Replays moves, compares cube states, segments commutators, and classifies special cases |
| [`src/utils/solveRecommender.js`](src/utils/solveRecommender.js) | Traces a clean solve from the scramble and applies cycle-break priorities or user overrides |
| [`src/utils/localSolveParser.js`](src/utils/localSolveParser.js) | Builds the parsed-solve response, move timeline, timing fields, and CubeDB URL |
| [`src/utils/localDatabase.js`](src/utils/localDatabase.js) | PGlite schema, migrations, normalized solve records, and algorithm-library queries |
| [`src/utils/commNotation.js`](src/utils/commNotation.js) | Normalizes and expands commutator notation used by library imports |
| [`src/data/`](src/data/) | Human-editable algorithm CSVs and the generated bundled library seed |
| [`src/service-worker.js`](src/service-worker.js) | App-shell, static-asset, and image caching for the PWA |

Two files belong to retained integrations rather than the current runtime architecture:

| Path | Status |
| --- | --- |
| [`src/utils/supabaseSync.js`](src/utils/supabaseSync.js) | Dormant Supabase REST prototype; the frontend guards it with `isSupabaseConfigured()`, and the production build provides no credentials |
| [`supabase_schema.sql`](supabase_schema.sql) | Prototype cloud schema with anonymous policies; not used by the deployed app |

## Run locally

```bash
npm ci --legacy-peer-deps
npm start
```

Then open `http://localhost:3000` in Chrome or another Chromium-based browser.

This project uses Create React App 4. On newer Node versions, Webpack may require the legacy OpenSSL provider.

PowerShell:

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm start
```

Bash:

```bash
NODE_OPTIONS=--openssl-legacy-provider npm start
```

## Tests and build

```bash
npm test -- --watchAll=false --runInBand
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

In PowerShell, set `$env:NODE_OPTIONS` first and then run `npm run build`.

The test suite covers cube-state parsing, special-case labels, solve recommendations, commutator notation, CSV/XLSX imports, local persistence behaviour, averages, and solve-detail interactions.

The production build registers the service worker. Development mode does not reproduce the full offline caching lifecycle.

## Browser data

PGlite stores the canonical browser dataset in IndexedDB. The schema separates sessions, solves, canonical commutator cases, commutators executed in each solve, and algorithm-library entries. `localStorage` remains in use for settings, compact recovery caches, and migration compatibility.

Clearing the site's browser data removes this local history. Use the application's export tools when moving data between browsers or devices.

See [Architecture: persistence](../docs/ARCHITECTURE.md#persistence) for the complete data flow.

## Graphite and teal UI

`src/theme.css` applies the shared typography, colour and compact layout rules. Solve details keep algorithms and timing columns aligned, with the recorded scramble available in a dialog. History times open OK/+2/DNF controls; the DNF badge opens reason and stage annotation. Clearing a reason preserves the result. Result penalties are reversible and do not change recorded memo/execution splits.

Normal solve result metadata is stored in the database's `result_json` column; practice records retain it in their complete JSON records. Both are included in backups. `scripts/prepare-database-runtime.js` copies the installed PGlite native modules and binaries to versioned public assets before start/build. The service worker caches the binaries for offline use.

Library search accepts memo words as well as existing letter-pair and special-case aliases, without case sensitivity. Type and Group filters still apply. **Save filters** stores a named combination of Type, Group and optional search text; **Saved filters** applies or deletes those favourites. The library also remembers the last filters used. Preferences are kept on-device and included in JSON backups; restoring an older backup preserves existing saved filters.
