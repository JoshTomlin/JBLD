jest.mock("./utils/bldParser", () => ({
  buildSolveAnalysis: jest.fn(),
}));

jest.mock("./utils/localSolveParser", () => ({
  buildLocalSolveResult: jest.fn(),
}));

jest.mock("./utils/localCommParser", () => ({
  buildLocalCommAnalysis: jest.fn(() => ({ commStats: [] })),
}));

jest.mock("./utils/solveRecommender", () => ({
  buildRecommendedSolve: jest.fn(),
}));

jest.mock("gan-web-bluetooth", () => ({
  connectGanCube: jest.fn(),
}));

jest.mock("cubing/alg", () => ({
  Alg: jest.fn().mockImplementation((algText) => ({ algText })),
  Move: class MockMove {
    constructor(move) {
      this.move = move;
    }
  },
}));

jest.mock("cubing/kpuzzle", () => ({
  KPuzzle: class MockKPuzzle {
    constructor() {
      this.state = {
        EDGES: { permutation: Array.from({ length: 12 }, (_, index) => index), orientation: Array(12).fill(0) },
        CORNERS: { permutation: Array.from({ length: 8 }, (_, index) => index), orientation: Array(8).fill(0) },
        CENTERS: { permutation: Array.from({ length: 6 }, (_, index) => index), orientation: Array(6).fill(0) },
      };
    }

    applyMove() {}
  },
}));

jest.mock("cubing/puzzles", () => ({
  experimentalCube3x3x3KPuzzle: {},
}));

jest.mock("cubing/notation", () => ({
  countMoves: jest.fn(() => 0),
}));

import App from "./App";

describe("solve details view data", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  it("normalizes legacy alg arrays before reconstruction rows render", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 175.65,
      memo_time: 67,
      exe_time: 108.65,
      comm_stats: [
        {
          comm_index: 1,
          phase: "corner",
          parse_text: "BP rotation",
          alg: ["R R U U'", { edge: false, corner: true, parity: false }],
          alg_length: 4,
          move_start_index: 1,
          move_end_index: 4,
        },
      ],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(details.cornerRows).toHaveLength(1);
    expect(app.compactRepeatedTurns(details.cornerRows[0].alg)).toBe("R2");
  });

  it("converts smart-cube opposite face pairs into slice moves for display", () => {
    const app = new App();

    expect(app.compactRepeatedTurns("U2 L R' U2 R L'")).toBe("U2 M' B2 M");
  });

  it("preserves explicit wide moves instead of leaking rotations across later slice moves", () => {
    const app = new App();

    expect(app.compactRepeatedTurns("r U R' U' M U R U' R'")).toBe("r U R' U' M U R U' R'");
  });

  it("formats recent library algs with doubles and edge-only slice conversion", () => {
    const app = new App();

    expect(app.formatAlgLibraryAlg("R R U U'", "corner")).toBe("R2");
    expect(app.formatAlgLibraryAlg("U2 L R' U2 R L'", "edge")).toBe("U2 M' B2 M");
    expect(app.formatAlgLibraryAlg("L R' R R", "corner")).toBe("L R");
  });

  it("appends implicit parser rotations to displayed reconstruction algs", () => {
    const app = new App();

    expect(
      app.formatReconstructionAlg({
        alg: "L F R' F' M F R F' R'",
        implicit_rotation: "x",
        phase: "edge",
      })
    ).toBe("L F R' F' M F R F' R' x");
  });

  it("saves CubeDB links with the recorded cube scramble", () => {
    const app = new App();
    const recordedScramble = "U R F";
    const plannedScramble = "L D B";
    const serverLink = `https://www.cubedb.net/?puzzle=3&scramble=${encodeURIComponent(
      plannedScramble
    )}&alg=R+U`;

    const solve = app.buildSolveRecord(
      { txt: "2.00(0.50,1.50)", cubedb: serverLink, commStats: [], moveTimeline: [] },
      {
        TIME_SOLVE: "2",
        MEMO: "0.5",
        SCRAMBLE: recordedScramble,
        SOLVE: "R U",
        CUBE_OREINTATION: "white-green",
      }
    );

    expect(new URL(solve.link).searchParams.get("scramble")).toBe(recordedScramble);
    expect(new URL(solve.link).searchParams.get("alg")).toBe("R U");
  });

  it("adds the cube orientation to CubeDB while keeping physical moves aligned", () => {
    const app = new App();
    const link = app.withRecordedScrambleInCubedb(
      "https://www.cubedb.net/?puzzle=3&scramble=L+D+B&alg=R+U",
      "U R F",
      "U R",
      "yellow-green"
    );

    expect(new URL(link).searchParams.get("alg")).toBe("z2\nD L");
  });

  it("shows saved CubeDB links with the stored recorded scramble", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 2,
      memo_time: 0.5,
      exe_time: 1.5,
      scramble: "U R F",
      link: "https://www.cubedb.net/?puzzle=3&scramble=L+D+B&alg=R+U",
      solve: "",
      comm_stats: [],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(new URL(details.link).searchParams.get("scramble")).toBe("U R F");
    expect(new URL(details.link).searchParams.get("alg")).toBe("R U");
  });

  it("uses parser success to mark saved DNFs and update accuracy", () => {
    const app = new App();
    const solve = app.buildSolveRecord(
      {
        txt: "12.00(3.00,9.00)",
        success: false,
        cubedb: "https://www.cubedb.net/?puzzle=3&scramble=U&alg=R",
        commStats: [],
        moveTimeline: [],
      },
      {
        TIME_SOLVE: "12",
        MEMO: "3",
        SCRAMBLE: "U",
        SOLVE: "R",
      }
    );

    expect(solve.DNF).toBe(true);
    expect(app.getSessionSummary({ solves: [solve] }).successText).toBe("0/1");
  });

  it("calculates recognition and exec times for each reconstruction row", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 10,
      memo_time: 2,
      exe_time: 8,
      comm_stats: [
        {
          comm_index: 1,
          phase: "edge",
          parse_text: "AU",
          alg: "U2 M U2 M'",
          alg_length: 4,
          move_start_index: 2,
          move_end_index: 5,
        },
        {
          comm_index: 2,
          phase: "edge",
          parse_text: "BP",
          alg: "R U R'",
          alg_length: 3,
          move_start_index: 7,
          move_end_index: 9,
        },
      ],
      move_timeline: [
        { time_offset: 0 },
        { time_offset: 1.2 },
        { time_offset: 1.7 },
        { time_offset: 2.4 },
        { time_offset: 3.5 },
        { time_offset: 4.1 },
        { time_offset: 5.3 },
        { time_offset: 5.8 },
        { time_offset: 6.4 },
      ],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(details.edgeRows[0].recogDuration).toBe(1.2);
    expect(details.edgeRows[0].execDuration).toBe(2.3);
    expect(details.edgeRows[1].recogDuration).toBeCloseTo(1.8);
    expect(details.edgeRows[1].execDuration).toBeCloseTo(1.1);
    expect(app.formatReconstructionLine(details.edgeRows[0])).toBe("U2 M U2 M' (AU)");
    expect(app.formatCommTimingPair(details.edgeRows[0])).toBe("3.5");
  });

  it("keeps unparsed DNF move tails inside the active reconstruction phase", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 10,
      memo_time: 2,
      exe_time: 8,
      DNF: true,
      comm_stats: [
        {
          comm_index: 1,
          phase: "unknown",
          piece_type: "unknown",
          parse_text: "?",
          alg: "R U R' U' F",
          alg_length: 5,
          move_start_index: 1,
          move_end_index: 5,
        },
      ],
      move_timeline: [
        { time_offset: 0 },
        { time_offset: 0.5 },
        { time_offset: 1.1 },
        { time_offset: 1.8 },
        { time_offset: 2.6 },
      ],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(details.edgeRows).toHaveLength(1);
    expect(details.cornerRows).toHaveLength(0);
    expect(details.edgeRows[0].displayPhase).toBe("edge");
    expect(app.formatReconstructionLine(details.edgeRows[0])).toBe("R U R' U' F (?)");
    expect(app.formatCommTimingPair(details.edgeRows[0])).toBe("2.6");
  });

  it("keeps unknown rows in order before the next corner comm", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 10,
      memo_time: 2,
      exe_time: 8,
      comm_stats: [
        {
          comm_index: 1,
          phase: "edge",
          parse_text: "AU",
          alg: "U2 M U2 M'",
          alg_length: 4,
          move_start_index: 1,
          move_end_index: 4,
        },
        {
          comm_index: 2,
          phase: "unknown",
          piece_type: "unknown",
          parse_text: "?",
          alg: "R U",
          alg_length: 2,
          move_start_index: 5,
          move_end_index: 6,
        },
        {
          comm_index: 3,
          phase: "corner",
          parse_text: "BP",
          alg: "R D R'",
          alg_length: 3,
          move_start_index: 7,
          move_end_index: 9,
        },
      ],
      move_timeline: [],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(details.edgeRows).toHaveLength(2);
    expect(details.cornerRows).toHaveLength(1);
    expect(details.edgeRows[1].phase).toBe("unknown");
    expect(details.edgeRows[1].displayPhase).toBe("edge");
    expect(app.formatReconstructionLine(details.edgeRows[1])).toBe("R U (?)");
  });

  it("formats comm lists with commas and hyphenated special cases", () => {
    const app = new App();
    const groups = app.groupCommBreakdown([
      { phase: "edge", parse_text: "AU" },
      { phase: "edge", parse_text: "DB flip" },
      { phase: "unknown", parse_text: "?" },
      { phase: "corner", parse_text: "PB rotation" },
      { phase: "parity", parse_text: "A Parity" },
    ]);

    expect(groups.edges.join(", ")).toBe("AU, DB-Flip, ?");
    expect(groups.corners.join(", ")).toBe("PB-Twist");
    expect(groups.parity.join(", ")).toBe("A-Parity");
  });

  it("shows unknown comms as question marks in the last solve summary", () => {
    const app = new App();
    const solve = {
      time_solve: 20,
      memo_time: 5,
      exe_time: 15,
      comm_stats: [
        { phase: "edge", parse_text: "AU", move_start_index: 1, move_end_index: 4 },
        { phase: "unknown", parse_text: "?", move_start_index: 5, move_end_index: 6 },
        { phase: "corner", parse_text: "BP", move_start_index: 7, move_end_index: 10 },
      ],
      move_timeline: [],
    };

    const panel = app.getLastSolvePanelData(solve);

    expect(panel.lines[0].value).toBe("AU, ?");
    expect(panel.lines[1].value).toBe("BP");
  });

  it("opens the last solve details modal with the selected solve", () => {
    const app = new App();
    app.setState = (update) => {
      const nextState =
        typeof update === "function" ? update(app.state, app.props) : update;
      app.state = { ...app.state, ...nextState };
    };
    app.fetchSolveDetails = jest.fn(() => new Promise(() => {}));

    const solve = {
      id: "solve-1",
      txt_solve: "parsed solve text",
      comm_stats: [],
    };

    app.openSolveDetails(solve);

    expect(app.state.showLastSolveDetails).toBe(true);
    expect(app.state.selectedSolveDetails).toEqual(solve);
    expect(app.state.parsed_solve_txt).toBe("parsed solve text");
    expect(app.state.loadingSolveDetails).toBe(true);
  });

  it("stores recognition and exec times on saved comm stats", () => {
    const app = new App();
    const solve = app.buildSolveRecord(
      {
        txt: "10.00(2.00,8.00)",
        cubedb: "https://www.cubedb.net/?puzzle=3&scramble=U&alg=R",
        commStats: [
          {
            comm_index: 1,
            phase: "edge",
            parse_text: "AU",
            alg: "U2 M U2 M'",
            alg_length: 4,
            move_start_index: 2,
            move_end_index: 5,
          },
        ],
        moveTimeline: [
          { time_offset: 0 },
          { time_offset: 1.2 },
          { time_offset: 1.7 },
          { time_offset: 2.4 },
          { time_offset: 3.5 },
        ],
      },
      {
        TIME_SOLVE: "10",
        MEMO: "2",
        SCRAMBLE: "U",
        SOLVE: "R U",
      }
    );

    expect(solve.comm_stats[0].recog_time).toBe(1.2);
    expect(solve.comm_stats[0].exec_time).toBe(2.3);
  });

  it("uses numeric string move offsets for comm timings", () => {
    const app = new App();
    const solve = {
      date: Date.now(),
      time_solve: 10,
      memo_time: 2,
      exe_time: 8,
      comm_stats: [
        {
          comm_index: 1,
          phase: "edge",
          parse_text: "AU",
          alg: "U2 M U2 M'",
          alg_length: 4,
          move_start_index: 2,
          move_end_index: 5,
        },
      ],
      move_timeline: [
        { time_offset: "0" },
        { time_offset: "1.2" },
        { time_offset: "1.7" },
        { time_offset: "2.4" },
        { time_offset: "3.5" },
      ],
    };

    const details = app.getSolveDetailsViewData(solve, [solve]);

    expect(details.edgeRows[0].recogDuration).toBe(1.2);
    expect(details.edgeRows[0].execDuration).toBe(2.3);
  });

  it("simplifies scramble text for solve details", () => {
    const app = new App();

    expect(app.formatScrambleForDetails("R R U U' L L")).toBe("R2 L2");
  });

  it("does not introduce slice moves when simplifying scramble text for solve details", () => {
    const app = new App();

    expect(app.formatScrambleForDetails("U2 L R' U2 R L'")).toBe("U2 L R' U2 R L'");
  });

  it("keeps saved Alg Review algs out of the visible active-card fallback", () => {
    const app = new App();
    const entry = { description: "", alg: "R U R'", piece_type: "edge" };

    expect(app.getAlgReviewTargetAlgText(entry, { includeAlgFallback: false })).toBe("");
    expect(app.getAlgReviewTargetAlgText(entry)).toBe("R U R'");
  });

  it("keeps solve-details comm editor keystrokes in the draft buffer", () => {
    const app = new App();
    app.setState = (update, callback) => {
      const nextState = typeof update === "function" ? update(app.state, app.props) : update;
      app.state = { ...app.state, ...nextState };
      if (callback) {
        callback();
      }
    };
    const entry = {
      description: "Old description",
      alg: "R U",
      memo_word: "old memo",
      category: "Old set",
      notes: "Old notes",
    };

    app.openSolveDetailsCommEditor(entry);
    app.updateSolveCommEditorDraftField("alg", "U R");

    expect(app.state.solveCommEditorDraft.alg).toBe("R U");
    expect(app.solveCommEditorDraftBuffer.alg).toBe("U R");

    app.closeSolveDetailsCommCard();

    expect(app.state.solveCommEditorDraft).toBeNull();
    expect(app.solveCommEditorDraftBuffer).toBeNull();
  });

  it("clears Alg Review current moves when retrying or advancing", () => {
    const app = new App();
    app.setState = (update, callback) => {
      const nextState = typeof update === "function" ? update(app.state, app.props) : update;
      app.state = { ...app.state, ...nextState };
      if (callback) {
        callback();
      }
    };
    app.resetAlgReviewAttemptCube = jest.fn();
    const entry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "alpha", category: "Set" };
    const nextEntry = { id: "edge-cd", case_code: "CD", piece_type: "edge", memo_word: "charlie", category: "Set" };
    app.state = {
      ...app.state,
      drillMode: "alg-review",
      drillQueue: [entry, nextEntry],
      drillCurrentIndex: 1,
      drillCurrentEntry: nextEntry,
      drillNextEntry: null,
      drillExecutingEntry: nextEntry,
      drillCurrentMoves: ["R", "U"],
      cube_moves: ["R", "U"],
      algReviewAttemptRecords: [],
    };

    app.retryDrillEntry();

    expect(app.state.drillCurrentIndex).toBe(1);
    expect(app.state.drillCurrentEntry).toBe(nextEntry);
    expect(app.state.drillCurrentMoves).toEqual([]);

    app.state = {
      ...app.state,
      drillCurrentIndex: 0,
      drillCurrentEntry: entry,
      drillNextEntry: nextEntry,
      drillExecutingEntry: null,
      drillCurrentMoves: ["F"],
      cube_moves: ["R", "U", "F"],
    };

    app.advanceDrillSession({ skipped: true });

    expect(app.state.drillCurrentMoves).toEqual([]);
  });
});

describe("large local storage resilience", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  it("keeps full sessions in memory when localStorage quota is exceeded", () => {
    const app = new App();
    app.persistLocalDatabaseSnapshot = jest.fn(() => Promise.resolve());
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const quotaError = new Error("QuotaExceededError");
    quotaError.name = "QuotaExceededError";
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (["sessions", "solves", "sessionsCompacted"].includes(key)) {
        throw quotaError;
      }
      return value;
    });
    const solves = Array.from({ length: 300 }, (_, index) => ({
      id: `solve-${index}`,
      date: index,
      time_solve: 10 + index,
    }));
    const sessions = [{ id: "session-1", name: "Big Session", createdAt: 1, updatedAt: 2, solves }];

    expect(() => app.persistSessionStorage(sessions, "session-1")).not.toThrow();
    expect(app.sessionStorageCache.sessions[0].solves).toHaveLength(300);
    expect(app.sessionStorageCache.activeSessionId).toBe("session-1");

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});