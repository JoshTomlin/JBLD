const { extractRecordedSolveData } = require("./extractRecordedSolve");

describe("extractRecordedSolveData", () => {
  it("splits scramble and solve moves around timer start", () => {
    const result = extractRecordedSolveData({
      moves: ["U", "R", "F", "L"],
      moveTimes: [1000, 2000, 3000, 4000],
      timeStart: 2500,
      timeFinish: 4500,
    });

    expect(result.scramble).toEqual(["U", "R"]);
    expect(result.solve).toEqual(["F", "L"]);
    expect(result.memoTime).toBe(0.5);
    expect(result.solveMoveOffsets).toEqual([0, 1]);
  });

  it("keeps moves recorded at exactly the timer start", () => {
    const result = extractRecordedSolveData({
      moves: ["R", "U", "R'"],
      moveTimes: [5000, 5500, 6000],
      timeStart: 5000,
      timeFinish: 6500,
    });

    expect(result.scramble).toEqual([]);
    expect(result.solve).toEqual(["R", "U", "R'"]);
    expect(result.memoTime).toBe(0);
    expect(result.solveMoveOffsets).toEqual([0, 0.5, 1]);
  });

  it("falls back to post-start moves even when finish bounds are noisy", () => {
    const result = extractRecordedSolveData({
      moves: ["B", "L", "D"],
      moveTimes: [9000, 9200, 9400],
      timeStart: 9000,
      timeFinish: 9050,
    });

    expect(result.solve).toEqual(["B"]);
    expect(result.solveMoveOffsets).toEqual([0]);
  });
});
