// Exercise browser storage against real PGlite, including a disk reopen.
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const babel = require("@babel/core");
const { PGlite } = require("@electric-sql/pglite");

function loadStorageModule(db) {
  const modules = new Map();
  const load = (filename) => {
    if (modules.has(filename)) return modules.get(filename);
    const module = { exports: {} };
    modules.set(filename, module.exports);
    const { code } = babel.transformFileSync(filename, {
      babelrc: false,
      configFile: false,
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    });
    const localRequire = (name) => {
      if (name === "@electric-sql/pglite/dist/index.cjs") {
        // Substitute only the browser filesystem location, keeping the real database.
        return { PGlite: function TestPGlite() { return db; } };
      }
      return name.startsWith(".")
        ? load(path.resolve(path.dirname(filename), `${name}.js`))
        : require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.resolve(__dirname, "../src/utils/localDatabase.js"));
}

test("practice storage survives migration, reload, recovery and reset", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "jbld-practice-test-"));
  let db = new PGlite(dataDir);
  let storage = loadStorageModule(db);
  const solves = Array.from({ length: 450 }, (_, index) => ({
    id: `practice-${index}`,
    date: index + 1,
    practice_type: index % 2 ? "edges" : "corners",
    time_solve: index + 10,
    DNF: index % 7 === 0,
    comm_stats: [{ phase: "edge", parse_text: "AB", recog_time: 0.2 }],
    move_timeline: [{ notation: "R", time_offset: 0.3 }],
    dnf_reason: index % 7 === 0 ? "Wrong Memo" : "",
  }));

  try {
    await t.test("migrates the entire legacy history with reconstruction data", async () => {
      assert.deepEqual(await storage.bootstrapPracticeStorageIntoDatabase(solves), solves);
    });
    await t.test("reopens persisted history and ignores a truncated legacy cache", async () => {
      await db.close();
      db = new PGlite(dataDir);
      storage = loadStorageModule(db);
      assert.deepEqual(await storage.bootstrapPracticeStorageIntoDatabase(solves.slice(-300)), solves);
    });
    await t.test("rolls back a failed replacement without dropping existing history", async () => {
      await assert.rejects(storage.persistPracticeSolvesToDatabase([solves[0], solves[0]]));
      assert.deepEqual(await storage.loadPracticeSolvesFromDatabase(), solves);
    });
    await t.test("replays a complete pending snapshot, including deletions", async () => {
      const recovered = solves.slice(1);
      assert.deepEqual(await storage.bootstrapPracticeStorageIntoDatabase(recovered, { complete: true }), recovered);
    });
    await t.test("merges attempts made before hydration with older database history", async () => {
      const earlySolve = { ...solves[0], id: "early-solve" };
      assert.deepEqual(
        await storage.bootstrapPracticeStorageIntoDatabase([...solves.slice(-300), earlySolve], { complete: false }),
        [...solves.slice(1), earlySolve]
      );
    });
    await t.test("persists an empty reset without remigrating stale cache data", async () => {
      await storage.persistPracticeSolvesToDatabase([]);
      assert.deepEqual(await storage.bootstrapPracticeStorageIntoDatabase(solves), []);
    });
  } finally {
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("normal solve reasons and penalties survive a database reopen", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "jbld-result-test-"));
  let db = new PGlite(dataDir);
  let storage = loadStorageModule(db);
  const session = { id: "results", name: "Results", createdAt: 1, updatedAt: 2, solves: [
    { id: "penalty", date: 100, time_solve: 44.83, memo_time: 17.1, exe_time: 25.73, DNF: false, result_penalty: 2, unpenalized_time: 42.83 },
    { id: "failure", date: 200, time_solve: 50, memo_time: 20, exe_time: 30, DNF: true, dnf_reason: "Wrong Corner Exec" },
  ] };
  try {
    await storage.importAlgLibraryEntries([{ id: "edge-ab", piece_type: "edge", case_code: "AB", alg: "R U R'", memo_word: "Abe" }]);
    assert.equal((await storage.getAlgLibraryEntries({ pieceType: "all", search: "" })).entries[0].case_code, "AB");
    assert.equal((await storage.getAlgLibraryEntries({ pieceType: "edge", search: "AB" })).totalCount, 1);
    await storage.persistDatasetToDatabase({ sessions: [session], activeSessionId: session.id });
    await db.query("UPDATE solves SET result_json = '{}' WHERE id = 'failure'");
    const upgraded = await storage.bootstrapLegacyStorageIntoDatabase({ sessions: [session], activeSessionId: session.id });
    assert.equal(upgraded.sessions[0].solves.find((s) => s.id === "failure").dnf_reason, "Wrong Corner Exec");
    const recovered = { ...session, solves: [{ ...session.solves[0], time_solve: 42.83, result_penalty: 0, updatedAt: 1000 }] };
    const recoveredData = await storage.bootstrapLegacyStorageIntoDatabase({ sessions: [recovered], activeSessionId: session.id });
    assert.equal(recoveredData.sessions[0].solves.find((s) => s.id === "penalty").result_penalty, 0);
    // An older cache cannot undo the recovered edit.
    const stale = await storage.bootstrapLegacyStorageIntoDatabase({ sessions: [session], activeSessionId: session.id });
    assert.equal(stale.sessions[0].solves.find((s) => s.id === "penalty").result_penalty, 0);
    await storage.persistDatasetToDatabase({ sessions: [session], activeSessionId: session.id });
    await db.close();
    db = new PGlite(dataDir);
    storage = loadStorageModule(db);
    const restored = (await storage.loadDatasetFromDatabase()).sessions[0].solves;
    assert.equal(restored[0].date, 100);
    assert.equal(restored[1].date, 200);
    assert.equal(restored[0].result_penalty, 2);
    assert.equal(restored[0].unpenalized_time, 42.83);
    assert.equal(restored[0].exe_time, 25.73);
    assert.equal(restored[1].DNF, true);
    assert.equal(restored[1].dnf_reason, "Wrong Corner Exec");
  } finally {
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("migrates fallback algorithm edits without overwriting later database edits", async () => {
  const db = new PGlite();
  await db.waitReady;
  const previousWindow = globalThis.window;
  const cache = new Map();
  globalThis.window = { localStorage: { getItem: (key) => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) } };
  try {
    const storage = loadStorageModule(db);
    const entry = { id: "edge-ab", piece_type: "edge", case_code: "AB", sheet_name: "bundled-edges.csv", alg: "R U R'", memo_word: "My custom memo", description: "My custom notation", alternate_algs: ["R U2 R'"] };
    await storage.importAlgLibraryEntries([{ ...entry, memo_word: "Abe" }]);
    cache.set("jbld-local-alg-library", JSON.stringify([entry]));
    await storage.bootstrapFallbackAlgLibrary();
    const migrated = (await storage.getAlgLibraryEntries({ pieceType: "edge" })).entries[0];
    assert.equal(migrated.memo_word, "My custom memo");
    assert.deepEqual(migrated.alternate_algs, ["R U2 R'"]);
    await storage.updateAlgLibraryEntry(entry.id, { ...entry, memoWord: "Edited again" });
    await storage.bootstrapFallbackAlgLibrary();
    assert.equal((await storage.getAlgLibraryEntries({ pieceType: "edge" })).entries[0].memo_word, "Edited again");
  } finally {
    globalThis.window = previousWindow;
    await db.close();
  }
});
