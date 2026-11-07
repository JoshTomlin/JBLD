# Development guide

The React PWA in `website/` is the current development target. It contains the UI, local parser, recommended-solve logic, PGlite database, smart-cube integrations, and test suite.

## Prerequisites

- Node.js and npm. The Pages workflow uses Node 22; the application is based on Create React App 4.
- A Chromium-based browser for Web Bluetooth testing.

Python, Docker, PostgreSQL, and Supabase are not required for current application development.

`website/package.json` still carries its original Node 14.17.5 `engines` value. The current verified path is the Node 22 Pages build with the OpenSSL compatibility flag described below.

## Frontend setup

```bash
cd website
npm ci --legacy-peer-deps
npm start
```

Open `http://localhost:3000`.

### OpenSSL note

Webpack 4 uses an older hashing implementation. On modern Node versions, set the legacy OpenSSL provider if `npm start` or `npm run build` reports `ERR_OSSL_EVP_UNSUPPORTED`.

PowerShell:

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm start
```

Bash:

```bash
NODE_OPTIONS=--openssl-legacy-provider npm start
```

The same flag applies to `npm run build`.

## Tests

Run all frontend tests once:

```bash
cd website
npm test -- --watchAll=false --runInBand
```

Run the real PGlite practice-storage integration checks with Node 22:

```bash
npm run test:storage
```

These checks cover migration, histories larger than the recovery cache, reopening the database, failed-write rollback, recovery snapshots, and resets.

Run one suite while working on parser behaviour:

```bash
npm test -- --watchAll=false --runInBand src/utils/localCommParser.test.js
```

Relevant suites include:

| Area | Test file |
| --- | --- |
| Cube-state segmentation and special cases | `src/utils/localCommParser.test.js` |
| Recommended memo and cycle breaks | `src/utils/solveRecommender.test.js` |
| Solve details and review workflows | `src/App.solveDetails.test.jsx` |
| Exported reconstruction text | `src/utils/bldParser.test.js` |
| Commutator expansion | `src/utils/commNotation.test.js` |
| CSV/XLSX algorithm imports | `src/utils/algCsvImport.test.js`, `src/utils/algWorkbookImport.test.js` |
| Session averages and DNF handling | `src/utils/solveAverages.test.js` |

## Production build and PWA behaviour

Bash:

```bash
cd website
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

PowerShell:

```powershell
cd website
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm run build
```

The build output is written to `website/build/`. The service worker is registered only in production, so offline behaviour should be checked against a production build rather than the development server.

The GitHub Pages workflow in [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) runs the install and build steps whenever `master` or `main` is pushed. It deploys only the static contents of `website/build/`.

## Algorithm-library data

The editable source sheets are:

```text
website/src/data/corners.csv
website/src/data/edges.csv
website/src/data/parity.csv
website/src/data/flips.csv
website/src/data/twists.csv
```

`bundledAlgLibrary.js` is the generated offline seed. When changing source data, keep case codes, memo words, categories, notes, and expanded algorithms together, then run the library and importer tests.

## Parser changes

When changing commutator recognition:

1. Express the expected state in terms of physical pieces and sticker orientation.
2. Add a focused regression to `localCommParser.test.js`.
3. Check both raw sticker output and the user-facing letter label.
4. Consider buffer aliases: every sticker on the buffer cubie represents the same physical piece.
5. Consider whether the state can occur across two consecutive algorithms rather than one window.
6. Run the full frontend suite and a production build.

For recommender changes, test the trace with a slot map and verify that the working state swaps complete cubies. Also test explicit cycle-break overrides and termination so an invalid trace cannot repeat a target indefinitely.

## Browser data while developing

The application stores its main database in IndexedDB under the PGlite path `idb://jbld-local-db`. Settings, caches, and migration compatibility data also use `localStorage`.

Use a separate browser profile when testing destructive migrations or reset flows. Clearing site data removes local solve history and library edits for that origin.

## Historical components

The repository still contains the original Flask parser, server-side PostgreSQL persistence, a Docker/Nginx topology, dormant Supabase sync code, and an incomplete desktop BLE bridge. They are not prerequisites or deployment targets for the current PWA.

Read [Legacy and experimental components](LEGACY.md) before working on one of these paths; it lists the known version, security, and integration gaps.

## Documentation conventions

- Keep the root README readable without prior blind-solving knowledge.
- Put cube-method definitions in `docs/CONCEPTS.md` and current implementation detail in `docs/ARCHITECTURE.md`.
- Keep historical instructions in `docs/LEGACY.md` or the relevant legacy component README.
- Link to the code that supports a technical claim.
- Prefer a small, accurate example over a full solve dump.
