# JBLD

JBLD is a local-first timer and analysis tool for blindfolded Rubik's Cube solving. It records a solve from a Bluetooth smart cube, reconstructs the move sequence, separates it into blind-solving cases, and shows where time or execution was lost.

[Live app](https://joshtomlin.github.io/JBLD/) | [Historical video demo](https://www.youtube.com/watch?v=wQnM1zwroVU) | [Original TrainBLD announcement](https://www.speedsolving.com/threads/trainbld-new-web-timer-that-reconstructs-your-3bld-solves.85466/)

The project was originally published as TrainBLD. JBLD is the current name; some older service names and historical links in the repository still use TrainBLD.

## What problem it solves

A final time says very little about a blindfolded solve. The useful questions come afterwards:

- Was the memo correct?
- Which commutators were executed?
- Where did recognition or execution slow down?
- Was a DNF caused by memo, execution, parity, a twist, or a flip?
- What would a clean solution for the scramble have looked like?

JBLD turns the recorded moves into a structured reconstruction so those questions can be answered from the cube state and move timings rather than memory alone.

## What the application does

- Connects to supported Bluetooth smart cubes and records moves with timestamps.
- Replays the scramble and solve on a cubie-level 3x3 model.
- Detects edge and corner cycles, parity, flips, twists, floating cycles, and cycle breaks.
- Converts sticker targets into the solver's letter scheme and buffer choices.
- Measures recognition and execution time for each reconstructed case.
- Builds a recommended memo and solve from the scramble, with editable cycle-break choices.
- Stores sessions, solves, commutators, and a personal algorithm library in the browser.
- Provides practice, algorithm review, history, statistics, import/export, and CubeDB links.
- Works as an installable PWA; the core timer, parser, library, and history are available offline after the app has been cached.

## How reconstruction works

1. The timer records the scramble, solve moves, and move timestamps.
2. The move sequence is normalized for the selected cube orientation without losing the physical move order.
3. `cubing.js` replays the solve and stores the cube state after every move.
4. The parser compares state windows and looks for changes that match one blind-solving case.
5. It classifies each accepted window as a normal cycle, parity, flip, twist, or another supported special case.
6. The resulting commutator and move records feed the reconstruction, statistics, library, and review views.

The recommended solve is calculated separately from the executed solution. It traces the scramble from the configured buffers, chooses cycle breaks, identifies orientation-only pieces, and lets the user replace a proposed cycle break with the target they actually used.

## Current architecture

The current application is a static React PWA. Parsing, recommendations, and persistence all run in the browser; GitHub Actions builds `website/` and deploys it to GitHub Pages.

| Area | Status and role | Main technology |
| --- | --- | --- |
| [`website/`](website/) | Current application: UI, Bluetooth input, parser, recommender, PWA, browser database, and tests | JavaScript, React, JSX, CSS, `cubing.js`, PGlite |
| [`.github/workflows/`](.github/workflows/) | Current build and GitHub Pages deployment | GitHub Actions, YAML |
| [`docs/`](docs/) | Concepts, implementation, development, and historical-component notes | Markdown |
| [`server/`](server/), [`database/`](database/), [`nginx/`](nginx/), [`docker-compose.yml`](docker-compose.yml) | Legacy Python API and container deployment retained for reference; not used by the current deployment | Python, Flask, PostgreSQL, Docker, Nginx |
| [`bridge/`](bridge/) | Incomplete experimental desktop BLE-to-WebSocket bridge; not used by the PWA | Node.js, WebSocket, Noble/Web Bluetooth |

The frontend still contains compatibility hooks for the old API and a dormant Supabase sync prototype. Neither is configured or deployed by the current GitHub Pages workflow. See [Legacy and experimental components](docs/LEGACY.md) for the exact status of each path.

## Languages and why they are used

| Language or format | Use in this project | Why it fits |
| --- | --- | --- |
| JavaScript / JSX | Current UI, cube replay, parsing, recommendations, Bluetooth input, persistence, imports, and tests | Keeps the complete solve-analysis pipeline on-device and close to the React UI |
| CSS / HTML | Responsive timer, reconstruction, library, drill views, and PWA shell | Delivers a phone-friendly application without a separate native client |
| SQL | PGlite migrations for sessions, solves, commutators, and the algorithm library | Gives structured, queryable local history inside the browser |
| CSV | Source data for edge, corner, parity, flip, and twist algorithms | Keeps algorithm data easy to inspect, edit, version, import, and export |
| YAML | GitHub Pages build and deployment | Keeps the deployed build reproducible in CI |
| Python / PostgreSQL / Docker / Nginx | Earlier server-side parser, API, persistence, and deployment | Records the project's original server architecture; these paths are now legacy |

## Documentation

- [Blind-solving concepts](docs/CONCEPTS.md) explains buffers, letter schemes, commutators, cycle breaks, parity, twists, and flips.
- [Architecture](docs/ARCHITECTURE.md) follows move capture through parsing, recommendations, persistence, and deployment.
- [Development guide](docs/DEVELOPMENT.md) covers the current frontend setup, tests, and production build.
- [Web application](website/README.md) maps the main frontend responsibilities and modules.
- [Legacy and experimental components](docs/LEGACY.md) records the status of the Python API, PostgreSQL stack, Supabase prototype, Docker files, and BLE bridge.
- [Legacy Python service](server/README.md) documents the original parser and API implementation.

## Quick start

```bash
cd website
npm ci --legacy-peer-deps
npm start
```

Open `http://localhost:3000` in a Chromium-based browser. Web Bluetooth requires a secure context, but browsers treat `localhost` as secure for development.

Run the frontend tests with:

```bash
cd website
npm test -- --watchAll=false --runInBand
```

Create React App 4 may need `NODE_OPTIONS=--openssl-legacy-provider` on a modern Node.js release. The [development guide](docs/DEVELOPMENT.md) includes the PowerShell and Bash commands used by the current build.

## Current boundaries

- Web Bluetooth support is strongest in Chromium-based browsers.
- GitHub Pages deploys only the browser application; it does not run Python, a Web API, PostgreSQL, or Supabase.
- Browser data belongs to the browser profile. Use the application's export tools before clearing site data or moving devices.
- The retained Supabase schema permits anonymous access and is not suitable for a shared deployment without authentication and user-scoped policies.
- The desktop BLE bridge is unfinished and is not a supported connection path.

## Credits

The Bluetooth work builds on ideas and device support from [csTimer](https://github.com/cs0x7f/cstimer), and cube notation and state handling use [cubing.js](https://github.com/cubing/cubing.js).
