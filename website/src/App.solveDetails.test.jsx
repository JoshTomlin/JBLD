jest.mock("./utils/bldParser", () => ({
  buildSolveAnalysis: jest.fn(),
}));

jest.mock("./utils/localSolveParser", () => ({
  buildLocalSolveResult: jest.fn(),
}));

jest.mock("gan-web-bluetooth", () => ({
  connectGanCube: jest.fn(),
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
    expect(app.compactRepeatedTurns(details.cornerRows[0].alg)).toBe("R2 U U'");
  });

  it("converts smart-cube opposite face pairs into slice moves for display", () => {
    const app = new App();

    expect(app.compactRepeatedTurns("U2 L R' U2 R L'")).toBe("U2 M' B2 M");
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
    expect(app.formatCommTimingPair(details.edgeRows[0])).toBe("1.2 | 2.3");
  });

  it("formats comm lists with spaces and hyphenated special cases", () => {
    const app = new App();
    const groups = app.groupCommBreakdown([
      { phase: "edge", parse_text: "AU" },
      { phase: "edge", parse_text: "DB flip" },
      { phase: "corner", parse_text: "PB rotation" },
      { phase: "parity", parse_text: "A Parity" },
    ]);

    expect(groups.edges.join(" ")).toBe("AU DB-Flip");
    expect(groups.corners.join(" ")).toBe("PB-Twist");
    expect(groups.parity.join(" ")).toBe("A-Parity");
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
});
