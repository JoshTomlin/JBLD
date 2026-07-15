jest.mock("./utils/bldParser", () => ({
  buildSolveAnalysis: jest.fn(),
}));

jest.mock("./utils/localSolveParser", () => ({
  buildLocalSolveResult: jest.fn(),
}));

jest.mock("./utils/localCommParser", () => ({
  buildLocalCommAnalysis: jest.fn(() => ({ commStats: [] })),
  normalizeForOrientation: jest.fn((_scramble, solve) => {
    const tokens = String(solve || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return { commSolveTokens: tokens, solveTokens: tokens, useSmartCubeSlicePairs: false, rotationPrefix: "" };
  }),
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
import { normalizeForOrientation } from "./utils/localCommParser";

describe("solve details view data", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    normalizeForOrientation.mockImplementation((_scramble, solve) => {
      const tokens = String(solve || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return { commSolveTokens: tokens, solveTokens: tokens, useSmartCubeSlicePairs: false, rotationPrefix: "" };
    });
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
    expect(app.compactRepeatedTurns("L M' R'")).toBe("M2");
    expect(app.compactRepeatedTurns("L' M R")).toBe("M2");
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

    expect(groups.edges.join(", ")).toBe("AU, BD-Flip, ?");
    expect(groups.corners.join(", ")).toBe("BP-Twist");
    expect(groups.parity.join(", ")).toBe("A-Parity");
  });

  it("normalizes twist and flip labels alphabetically for library lookups", () => {
    const app = new App();

    expect(app.formatSpecialCommText("SP rotation")).toBe("PS-Twist");
    expect(app.formatSpecialCommText("DB flip")).toBe("BD-Flip");
    expect(
      app.getSolveDetailsCommLookup({
        phase: "corner",
        special_type: "rotation",
        target_a: "S",
        target_b: "P",
      })
    ).toEqual({
      label: "PS-Twist",
      pieceType: "twist",
      caseCode: "PS",
    });
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


  it("uses only the memo word as the Alg Review prompt", () => {
    const app = new App();

    expect(app.buildAlgReviewPromptText({ memo_word: "river", case_code: "AB", alg: "R U R'" })).toBe("river");
    expect(app.buildAlgReviewPromptText({ case_code: "AB", alg: "R U R'" })).toBe("--");
  });

  it("weights Alg Review queues toward older last-seen entries", () => {
    const app = new App();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(new Date("2026-07-14T00:00:00.000Z").getTime());
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    const recent = {
      id: "recent",
      case_code: "AB",
      piece_type: "edge",
      memo_word: "recent",
      alg: "R",
      last_seen_at: "2026-07-14T00:00:00.000Z",
    };
    const old = {
      id: "old",
      case_code: "CD",
      piece_type: "edge",
      memo_word: "old",
      alg: "R",
      last_seen_at: "2026-01-01T00:00:00.000Z",
    };

    const queue = app.buildDrillQueue([recent, old], { weightByLastSeen: true });

    expect(queue.map((entry) => entry.id)).toEqual(["old", "recent"]);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it("keeps randomness in Alg Review queues when entries have the same last-seen age", () => {
    const app = new App();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(new Date("2026-07-14T00:00:00.000Z").getTime());
    const randomSpy = jest.spyOn(Math, "random")
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.8);
    const first = {
      id: "first",
      case_code: "AB",
      piece_type: "edge",
      memo_word: "first",
      alg: "R",
      last_seen_at: "2026-01-01T00:00:00.000Z",
    };
    const second = {
      id: "second",
      case_code: "CD",
      piece_type: "edge",
      memo_word: "second",
      alg: "R",
      last_seen_at: "2026-01-01T00:00:00.000Z",
    };

    const queue = app.buildDrillQueue([first, second], { weightByLastSeen: true });

    expect(queue.map((entry) => entry.id)).toEqual(["second", "first"]);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it("stores drill attempt alg details and summarizes last-seen ages", () => {
    const app = new App();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(new Date("2026-07-15T00:00:00.000Z").getTime());
    app.state = {
      ...app.state,
      drillPromptStartedAt: new Date("2026-07-15T00:00:00.000Z").getTime() - 5000,
      drillAttemptStartedAt: new Date("2026-07-15T00:00:00.000Z").getTime() - 3000,
    };
    const entry = {
      id: "edge-ab",
      case_code: "AB",
      piece_type: "edge",
      memo_word: "alpha",
      description: "[A, B]",
      alg: "R U R'",
      category: "4-Mover",
      last_seen_at: "2026-07-01T00:00:00.000Z",
    };

    const record = app.buildDrillAttemptRecord(entry, { performedAlg: "R U R'", matched: true });
    const lastSeenCounts = app.getDrillLastSeenThresholdCounts([
      { lastSeenAt: "2026-07-14T12:00:00.000Z" },
      { lastSeenAt: "2026-07-13T00:00:00.000Z" },
      { lastSeenAt: "2026-07-01T00:00:00.000Z" },
      { lastSeenAt: "2026-06-01T00:00:00.000Z" },
    ]);

    expect(record).toMatchObject({
      caseCode: "AB",
      memoWord: "alpha",
      description: "[A, B]",
      libraryAlg: "R U R'",
      performedAlg: "R U R'",
      lastSeenAt: "2026-07-01T00:00:00.000Z",
      matched: true,
    });
    expect(lastSeenCounts).toMatchObject({
      total: 4,
      overDay: 3,
      overWeek: 2,
      overMonth: 1,
    });

    nowSpy.mockRestore();
  });

  it("filters drill stats by alg type before counting rusty algs", () => {
    const app = new App();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(new Date("2026-07-15T00:00:00.000Z").getTime());
    const records = [
      { id: "edge-ab", piece_type: "edge", last_seen_at: "2026-07-01T00:00:00.000Z" },
      { id: "corner-ab", piece_type: "corner", last_seen_at: "2026-06-01T00:00:00.000Z" },
      { id: "twist-ab", piece_type: "twist", last_seen_at: "2026-07-10T00:00:00.000Z" },
      { id: "flip-ab", piece_type: "flip", last_seen_at: "2026-05-01T00:00:00.000Z" },
      { id: "parity-a", piece_type: "parity", last_seen_at: "2026-07-14T12:00:00.000Z" },
    ];

    const twistRecords = app.filterDrillStatsRecordsByType(records, "twist");
    const allRecords = app.filterDrillStatsRecordsByType(records, "all");
    const twistCounts = app.getDrillLastSeenThresholdCounts(twistRecords);

    expect(twistRecords.map((record) => record.id)).toEqual(["twist-ab"]);
    expect(allRecords).toHaveLength(5);
    expect(twistCounts).toMatchObject({
      total: 1,
      overDay: 1,
      overWeek: 0,
      overMonth: 0,
    });

    nowSpy.mockRestore();
  });

  it("keeps old main algs when promoting an alternate alg", () => {
    const app = new App();
    const entry = {
      id: "edge-ab",
      case_code: "AB",
      piece_type: "edge",
      alg: "R U R'",
      alternate_algs: ["F R F'", "R U R'"],
    };

    const promotedAlternates = app.buildAlternateAlgsForMainAlg(entry, "F R F'");
    const nextDraft = app.promoteAlternateAlgInDraft(
      { alg: "R U R'", alternateAlgs: ["F R F'"] },
      "F R F'",
      "edge"
    );

    expect(promotedAlternates).toEqual(["R U R'"]);
    expect(nextDraft).toMatchObject({
      alg: "F R F'",
      alternateAlgs: ["R U R'"],
    });
  });

  it("builds memo audit rows and searches starts, endings, then memo text", () => {
    const app = new App();
    const entries = [
      { id: "edge-ab", piece_type: "edge", case_code: "AB", memo_word: "same" },
      { id: "corner-ab", piece_type: "corner", case_code: "AB", memo_word: "same" },
      { id: "edge-ba", piece_type: "edge", case_code: "BA", memo_word: "edge" },
      { id: "corner-ba", piece_type: "corner", case_code: "BA", memo_word: "corner" },
      { id: "edge-xb", piece_type: "edge", case_code: "XB", memo_word: "xeno" },
      { id: "corner-xb", piece_type: "corner", case_code: "XB", memo_word: "xeno" },
      { id: "edge-cd", piece_type: "edge", case_code: "CD", memo_word: "banana" },
      { id: "corner-cd", piece_type: "corner", case_code: "CD", memo_word: "banana" },
      { id: "edge-ai", piece_type: "edge", case_code: "AI", memo_word: "solo" },
    ];

    const allRows = app.buildMemoAuditRows(entries);
    const searchedRows = app.buildMemoAuditRows(entries, "b");

    expect(allRows.find((row) => row.caseCode === "BA").isMismatch).toBe(true);
    expect(allRows.find((row) => row.caseCode === "AI").isMismatch).toBe(false);
    expect(searchedRows.map((row) => row.caseCode)).toEqual(["BA", "AB", "XB", "CD"]);
  });

  it("finds alphabetized special alg library cases from reversed special searches", () => {
    const app = new App();
    const entries = [
      { id: "twist-ps", piece_type: "twist", case_code: "PS", memo_word: null },
      { id: "flip-ca", piece_type: "flip", case_code: "CA", memo_word: null },
      { id: "parity-b", piece_type: "parity", case_code: "B", memo_word: null },
      { id: "edge-sp", piece_type: "edge", case_code: "SP", memo_word: "sip" },
      { id: "corner-ps", piece_type: "corner", case_code: "PS", memo_word: "spoon" },
      { id: "edge-ab", piece_type: "edge", case_code: "AB", memo_word: "spoon" },
    ];

    expect(app.filterAlgLibraryEntries(entries, { search: "SP-Twist" }).map((entry) => entry.id)).toEqual([
      "twist-ps",
    ]);
    expect(app.filterAlgLibraryEntries(entries, { search: "AC-Flip" }).map((entry) => entry.id)).toEqual([
      "flip-ca",
    ]);
    expect(app.filterAlgLibraryEntries(entries, { search: "SP" }).map((entry) => entry.id).sort()).toEqual([
      "corner-ps",
      "edge-sp",
      "twist-ps",
    ]);
    expect(app.filterAlgLibraryEntries(entries, { search: "SPOON" }).map((entry) => entry.id)).toEqual([]);
    expect(app.getAlgLibraryDisplayMemoWord(entries[0])).toBe("PS-Twist");
    expect(app.getAlgLibraryDisplayMemoWord(entries[1])).toBe("AC-Flip");
    expect(app.getAlgLibraryDisplayMemoWord(entries[2])).toBe("B-Parity");
    expect(app.isAlgLibrarySpecialEntry(entries[0])).toBe(true);
    expect(app.isAlgLibrarySpecialEntry(entries[2])).toBe(true);
  });

  it("marks normal and practise solve comms as seen when they are saved", () => {
    const comm = { phase: "edge", parse_text: "AB" };
    const app = new App();
    app.buildSolveRecord = jest.fn(() => ({ comm_stats: [comm], date: 1234 }));
    app.updateActiveSessionSolves = jest.fn();
    app.persistPracticeSolves = jest.fn();
    app.markAlgLibraryCommsSeen = jest.fn();
    app.hasCloudSync = jest.fn(() => false);

    app.addSolveToLocalStorage({}, {});
    app.addPracticeSolveToLocalStorage({}, {});

    expect(app.markAlgLibraryCommsSeen).toHaveBeenCalledWith([comm], 1234);
    expect(app.markAlgLibraryCommsSeen).toHaveBeenCalledTimes(2);
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

  it("moves Alg Review back to the previous comm for a fresh retry", () => {
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
    const thirdEntry = { id: "edge-ef", case_code: "EF", piece_type: "edge", memo_word: "echo", category: "Set" };
    app.state = {
      ...app.state,
      drillMode: "alg-review",
      drillQueue: [entry, nextEntry, thirdEntry],
      drillCurrentIndex: 1,
      drillCurrentEntry: nextEntry,
      drillNextEntry: thirdEntry,
      drillExecutingEntry: null,
      drillCompletedCount: 1,
      drillSkippedCount: 0,
      drillCurrentMoves: ["R"],
      drillLastCommEntry: entry,
      drillLastCommMoves: ["R"],
      cube_moves: ["R"],
      algReviewAttemptRecords: [{ entryId: "edge-ab", skipped: false }],
    };

    app.backAlgReviewEntry();

    expect(app.resetAlgReviewAttemptCube).toHaveBeenCalled();
    expect(app.state.drillCurrentIndex).toBe(0);
    expect(app.state.drillCurrentEntry).toBe(entry);
    expect(app.state.drillNextEntry).toBe(nextEntry);
    expect(app.state.drillCurrentMoves).toEqual([]);
    expect(app.state.drillLastCommEntry).toBeNull();
    expect(app.state.drillCompletedCount).toBe(0);
    expect(app.state.drillStatusMessage).toBe("Back to alpha");
  });

  it("force-refreshes Drill entries from the library when starting", async () => {
    const app = new App();
    app.ensureBundledAlgLibraryLoaded = jest.fn(() => Promise.resolve());
    const staleEntry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "old", alg: "R" };
    const freshEntry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "new", alg: "R" };
    app.loadAlgReviewOptions = jest.fn(() => Promise.resolve({ entries: [freshEntry], groups: [] }));
    app.state = {
      ...app.state,
      drillMode: "alg-review",
      algReviewPieceType: "edge",
      algReviewGroup: "all",
      algReviewEntries: [staleEntry],
    };

    const entries = await app.getFilteredDrillEntries({ forceRefresh: true });

    expect(app.loadAlgReviewOptions).toHaveBeenCalledWith("edge");
    expect(entries).toEqual([freshEntry]);
  });

  it("hydrates saved Alg Review progress before resuming", async () => {
    const app = new App();
    app.setState = (update, callback) => {
      const nextState = typeof update === "function" ? update(app.state, app.props) : update;
      app.state = { ...app.state, ...nextState };
      if (callback) {
        callback();
      }
    };
    const staleEntry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "old", alg: "R" };
    const freshEntry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "new", alg: "R" };
    app.hydrateAlgReviewProgressEntries = jest.fn((progress) =>
      Promise.resolve({
        ...progress,
        queue: [freshEntry],
        currentEntry: freshEntry,
        nextEntry: null,
      })
    );
    app.state = {
      ...app.state,
      algReviewProgress: {
        pieceType: "edge",
        group: "all",
        queue: [staleEntry],
        currentIndex: 0,
        currentEntry: staleEntry,
        nextEntry: null,
      },
    };

    await app.resumeAlgReviewProgress();

    expect(app.hydrateAlgReviewProgressEntries).toHaveBeenCalled();
    expect(app.state.drillSessionActive).toBe(true);
    expect(app.state.drillCurrentEntry.memo_word).toBe("new");
    expect(app.state.drillQueue[0].memo_word).toBe("new");
    expect(app.state.drillLoading).toBe(false);
  });
  it("keeps Alg Review targets canonical while orienting live attempts", () => {
    normalizeForOrientation.mockImplementation((_scramble, solve, orientation) => {
      const tokens = String(solve || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const orientationMap = {
        R: "L",
        L: "R",
        U: "D",
        D: "U",
        "R'": "L'",
        "L'": "R'",
        "U'": "D'",
        "D'": "U'",
      };
      const orientedTokens = orientation === "yellow-green" ? tokens.map((move) => orientationMap[move] || move) : tokens;
      return { commSolveTokens: orientedTokens, solveTokens: orientedTokens, useSmartCubeSlicePairs: false, rotationPrefix: "z2" };
    });

    const app = new App();
    app.state = {
      ...app.state,
      parse_settings: { ...app.state.parse_settings, CUBE_OREINTATION: "yellow-green" },
    };
    const appliedMoves = [];
    app.applyAlgReviewMove = jest.fn((cube, move) => {
      appliedMoves.push(move);
      cube.state.EDGES.permutation[0] = appliedMoves.length;
    });

    app.getAlgReviewTargetSignature({ id: "edge-ab", description: "R U", piece_type: "edge" });

    expect(appliedMoves).toEqual(["R", "U"]);
    expect(normalizeForOrientation).not.toHaveBeenCalled();

    appliedMoves.length = 0;
    app.applyAlgReviewAttemptMoves(["L", "D"]);

    expect(appliedMoves).toEqual(["R", "U"]);
    expect(normalizeForOrientation).toHaveBeenCalledWith("", "L D", "yellow-green");
  });

  it("checks Alg Review completion after each hidden move, not only after the batch", () => {
    const app = new App();
    app.getAlgReviewTargetSignatures = jest.fn(() => ["goal"]);
    app.algReviewAttemptCube = { state: { signature: "start" } };
    app.getAlgReviewStateSignature = jest.fn((state) => state.signature);
    app.applyAlgReviewMove = jest.fn((cube, move) => {
      cube.state.signature = move === "hit" ? "goal" : "past";
    });

    expect(app.algReviewAttemptMatchesEntry({ id: "edge-ab" }, ["hit", "extra"])).toBe(true);
    expect(app.applyAlgReviewMove).toHaveBeenCalledTimes(1);
  });

  it("matches Alg Review completion up to cube orientation", () => {
    const app = new App();
    app.getAlgReviewTargetSignatures = jest.fn(() => ["goal"]);
    app.getAlgReviewStateSignature = jest.fn((state) => state.signature);
    app.getAlgReviewStateSignaturesModuloRotation = jest.fn((state) =>
      state.signature === "rotated-goal" ? ["rotated-goal", "goal"] : [state.signature]
    );
    app.applyAlgReviewMove = jest.fn((cube, move) => {
      cube.state.signature = move === "wide-as-opposite-face" ? "rotated-goal" : "past";
    });

    expect(app.algReviewAttemptMatchesEntry({ id: "edge-ab" }, ["wide-as-opposite-face", "extra"])).toBe(true);
    expect(app.applyAlgReviewMove).toHaveBeenCalledTimes(1);
  });

  it("uses smart-cube slice annotations for Alg Review attempts and display moves", () => {
    normalizeForOrientation.mockImplementation((_scramble, solve) => {
      if (solve === "L' R") {
        return { commSolveTokens: ["L'", "R"], solveTokens: ["M"], useSmartCubeSlicePairs: true, rotationPrefix: "" };
      }
      if (solve === "R L R'") {
        return { commSolveTokens: ["R", "L", "R'"], solveTokens: ["R", "M'"], useSmartCubeSlicePairs: true, rotationPrefix: "" };
      }
      if (solve === "L' R r") {
        return { commSolveTokens: ["L'", "R", "r"], solveTokens: ["M", "r"], useSmartCubeSlicePairs: true, rotationPrefix: "" };
      }
      const tokens = String(solve || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return { commSolveTokens: tokens, solveTokens: tokens, useSmartCubeSlicePairs: false, rotationPrefix: "" };
    });

    const app = new App();
    const appliedMoves = [];
    app.applyAlgReviewMove = jest.fn((_cube, move) => {
      appliedMoves.push(move);
    });

    expect(app.getAlgReviewOrientedMoves(["L'", "R", "r"])).toEqual(["L'", "R", "Rw"]);
    expect(app.getAlgReviewOrientedMoves(["L'", "R", "r"], { useSmartCubeSlicePairs: true })).toEqual(["M", "Rw"]);
    expect(app.getAlgReviewOrientedMoves(["L'", "R", "r"], { display: true })).toEqual(["M", "Rw"]);
    expect(app.formatAlgReviewCurrentMoves(["L'", "R", "r"])).toEqual(["M", "Rw"]);
    expect(app.formatAlgReviewCurrentMoves(["R", "R", "U", "U'"])).toEqual(["R2"]);
    expect(app.formatAlgReviewCurrentMoves(["L", "M'", "R'"], { pieceType: "edge" })).toEqual(["M2"]);
    expect(app.getAlgReviewOrientedMoves(["L'", "R"], { display: true, pieceType: "corner" })).toEqual(["L'", "R"]);
    expect(app.formatAlgReviewCurrentMoves(["L'", "R"], { pieceType: "corner" })).toEqual(["L'", "R"]);
    expect(app.getAlgReviewOrientedMoves(["R", "L", "R'"], {
      useSmartCubeSlicePairs: true,
      pieceType: "corner",
    })).toEqual(["R", "M'"]);
    expect(app.formatAlgReviewCurrentMoves(["R", "L", "R'"], { pieceType: "corner" })).toEqual(["R", "L", "R'"]);

    app.applyAlgReviewAttemptMoves(["L'", "R", "r"]);

    expect(appliedMoves).toEqual(["M", "Rw"]);

    appliedMoves.length = 0;
    app.applyAlgReviewAttemptMoves(["L'", "R"], null, { pieceType: "corner" });

    expect(appliedMoves).toEqual(["M"]);

    appliedMoves.length = 0;
    app.applyAlgReviewAttemptMoves(["R", "L", "R'"], null, { pieceType: "corner" });

    expect(appliedMoves).toEqual(["R", "M'"]);
  });

  it("compares Alg Review moves through commuting turns and wide-move equivalents", () => {
    const app = new App();

    expect(app.compareAlgReviewMoveSequences("U D R", ["D", "U", "R"]).matches).toBe(true);
    expect(app.compareAlgReviewMoveSequences("M2", ["L", "M'", "R'"]).matches).toBe(true);
    expect(app.buildAlgReviewComparisonSequence(["L", "M'", "R'"]).canonicalTokens).toEqual(["M2"]);
    const wideMatch = app.compareAlgReviewMoveSequences("r U", ["M'", "R", "U"]);
    expect(wideMatch.matches).toBe(true);
    expect(wideMatch.libraryCells.map((cell) => ({ token: cell.token, colSpan: cell.colSpan }))).toEqual([
      { token: "r", colSpan: 2 },
      { token: "U", colSpan: 1 },
    ]);
    expect(wideMatch.performedCells.map((cell) => cell.token)).toEqual(["M'", "R", "U"]);

    const mismatch = app.compareAlgReviewMoveSequences("R U R'", ["R", "U", "R"]);

    expect(mismatch.matches).toBe(false);
    expect(mismatch.performedTokens.map((move) => move.status)).toEqual(["match", "match", "mismatch"]);
    expect(mismatch.libraryCells.map((cell) => cell.token)).toEqual(["R", "U", "R'"]);
    expect(mismatch.performedCells.map((cell) => cell.token)).toEqual(["R", "U", "R"]);
  });

  it("recognizes smart-cube slice pairs across Alg Review move-stream updates", () => {
    normalizeForOrientation.mockImplementation((_scramble, solve) => {
      if (solve === "L' R") {
        return { commSolveTokens: ["L'", "R"], solveTokens: ["M"], useSmartCubeSlicePairs: true, rotationPrefix: "" };
      }
      const tokens = String(solve || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return { commSolveTokens: tokens, solveTokens: tokens, useSmartCubeSlicePairs: false, rotationPrefix: "" };
    });

    const app = new App();
    app.setState = (update, callback) => {
      const nextState = typeof update === "function" ? update(app.state, app.props) : update;
      app.state = { ...app.state, ...nextState };
      if (callback) {
        callback();
      }
    };
    app.resetAlgReviewAttemptCube = jest.fn((options = {}) => {
      app.algReviewAttemptCube = { state: { signature: "start" } };
      if (options.clearMoves !== false) {
        app.algReviewAttemptMoves = [];
      }
      return app.algReviewAttemptCube;
    });
    app.getAlgReviewTargetSignatures = jest.fn(() => ["goal"]);
    app.getAlgReviewStateSignature = jest.fn((state) => state.signature || "start");
    app.applyAlgReviewMove = jest.fn((cube, move) => {
      cube.state.signature = move === "M" ? "goal" : move;
    });
    app.persistAlgReviewAttemptRecords = jest.fn((records) => records);
    app.markAlgLibraryEntriesSeen = jest.fn(() => Promise.resolve([]));
    const entry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "alpha", category: "Set" };
    const nextEntry = { id: "edge-cd", case_code: "CD", piece_type: "edge", memo_word: "charlie", category: "Set" };
    app.state = {
      ...app.state,
      drillSessionActive: true,
      drillMode: "alg-review",
      drillQueue: [entry, nextEntry],
      drillCurrentIndex: 0,
      drillCurrentEntry: entry,
      drillNextEntry: nextEntry,
      drillExecutingEntry: null,
      drillProcessedMoveCount: 0,
      drillCompletedCount: 0,
      drillSkippedCount: 0,
      drillReviewEntries: [],
      algReviewAttemptRecords: [],
      algReviewPeekVisible: true,
      cube_moves: [],
    };

    app.handleDrillMoveStream(["L'"]);

    expect(app.state.drillCurrentEntry).toBe(entry);
    expect(app.state.drillExecutingEntry).toBe(entry);
    expect(app.state.drillCurrentMoves).toEqual(["L'"]);
    expect(app.state.algReviewPeekVisible).toBe(true);

    app.handleDrillMoveStream(["L'", "R"]);

    expect(app.applyAlgReviewMove).toHaveBeenLastCalledWith(expect.anything(), "M");
    expect(app.state.drillCurrentIndex).toBe(1);
    expect(app.state.drillCurrentEntry).toBe(nextEntry);
    expect(app.state.drillExecutingEntry).toBeNull();
    expect(app.state.drillCompletedCount).toBe(1);
    expect(app.state.drillCurrentMoves).toEqual([]);
    expect(app.state.drillLastCommEntry).toBe(entry);
    expect(app.state.drillLastCommMoves).toEqual(["M"]);
    expect(app.state.algReviewPeekVisible).toBe(false);
    expect(app.markAlgLibraryEntriesSeen).toHaveBeenCalledWith([entry], expect.any(Number));
  });

  it("does not replay old Alg Review moves when React state has not caught up", () => {
    const app = new App();
    app.setState = (update, callback) => {
      const nextState = typeof update === "function" ? update(app.state, app.props) : update;
      const { drillProcessedMoveCount: _laggedMoveCount, ...visibleState } = nextState;
      app.state = { ...app.state, ...visibleState };
      if (callback) {
        callback();
      }
    };
    app.resetAlgReviewAttemptCube = jest.fn((options = {}) => {
      app.algReviewAttemptCube = { state: { signature: "start" } };
      if (options.clearMoves !== false) {
        app.algReviewAttemptMoves = [];
      }
      return app.algReviewAttemptCube;
    });
    app.algReviewAttemptMatchesEntry = jest.fn(() => false);
    const entry = { id: "edge-ab", case_code: "AB", piece_type: "edge", memo_word: "alpha", category: "Set" };
    app.state = {
      ...app.state,
      drillSessionActive: true,
      drillMode: "alg-review",
      drillQueue: [entry],
      drillCurrentIndex: 0,
      drillCurrentEntry: entry,
      drillNextEntry: null,
      drillExecutingEntry: null,
      drillProcessedMoveCount: 0,
      algReviewPeekVisible: true,
      cube_moves: [],
    };

    app.handleDrillMoveStream(["R"]);
    app.handleDrillMoveStream(["R", "U"]);

    expect(app.algReviewAttemptMatchesEntry).toHaveBeenLastCalledWith(entry, ["R", "U"]);
    expect(app.algReviewAttemptMoves).toEqual(["R", "U"]);
    expect(app.state.drillCurrentMoves).toEqual(["R", "U"]);
    expect(app.state.algReviewPeekVisible).toBe(true);
  });

  it("falls back to the saved alg when Alg Review description is not executable notation", () => {
    const app = new App();
    const appliedMoves = [];
    app.applyAlgReviewMove = jest.fn((cube, move) => {
      if (move === "plain" || move === "words") {
        throw new Error("not an alg");
      }
      appliedMoves.push(move);
      cube.state.EDGES.permutation[0] = appliedMoves.length;
    });

    const signature = app.getAlgReviewTargetSignature({
      id: "edge-ab",
      description: "plain words",
      alg: "R U",
      piece_type: "edge",
    });

    expect(signature).toBeTruthy();
    expect(appliedMoves).toEqual(["R", "U"]);
  });

  it("skips an executing Alg Review prompt on the first press", () => {
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
      drillCurrentIndex: 0,
      drillCurrentEntry: entry,
      drillNextEntry: nextEntry,
      drillExecutingEntry: entry,
      drillSkippedCount: 0,
      drillReviewEntries: [],
      drillCurrentMoves: ["R"],
      cube_moves: ["R"],
      algReviewAttemptRecords: [],
    };

    app.advanceDrillSession({ skipped: true });

    expect(app.state.drillCurrentIndex).toBe(1);
    expect(app.state.drillCurrentEntry).toBe(nextEntry);
    expect(app.state.drillExecutingEntry).toBeNull();
    expect(app.state.drillSkippedCount).toBe(1);
    expect(app.state.drillCurrentMoves).toEqual([]);
    expect(app.state.drillLastCommEntry).toBe(entry);
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
