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
      }
    );

    expect(new URL(solve.link).searchParams.get("scramble")).toBe(recordedScramble);
    expect(new URL(solve.link).searchParams.get("alg")).toBe("R U");
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
});
