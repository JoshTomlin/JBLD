const {
  computeSessionAggregateStats,
  computeSessionBestStats,
  calculateTrimmedAverage,
  averageValues,
} = require("./solveAverages");

describe("solveAverages", () => {
  const helpers = {
    calcMo3: (arr) =>
      parseFloat(
        (
          arr.slice(-3).reduce((sum, solve) => sum + parseFloat(solve.time_solve), 0) / 3
        ).toFixed(2)
      ),
    calcAverage: (arr) =>
      parseFloat(
        (
          arr.reduce((sum, solve) => sum + parseFloat(solve.time_solve), 0) / arr.length
        ).toFixed(2)
      ),
    formatSeconds: (value) => String(value),
  };

  it("returns an empty string instead of crashing on empty values", () => {
    expect(averageValues([])).toBe("");
  });

  it("handles a local pwa solve with null fluidness", () => {
    const result = computeSessionAggregateStats(
      [
        {
          DNF: false,
          time_solve: 2.76,
          memo_time: 0.69,
          exe_time: 2.07,
          fluidness: null,
        },
      ],
      helpers
    );

    expect(result.current).toBe(2.76);
    expect(result.aoAll).toBe(2.76);
    expect(result.memo).toBe(0.69);
    expect(result.exe).toBe(2.07);
    expect(result.fluid).toBe("");
    expect(result.success).toBe("1/1");
  });

  it("handles all-dnf sessions without reducing empty arrays", () => {
    const result = computeSessionAggregateStats(
      [
        {
          DNF: true,
          time_solve: 12.34,
          memo_time: 1.23,
          exe_time: 11.11,
          fluidness: null,
        },
      ],
      helpers
    );

    expect(result.current).toBe("DNF(12.34)");
    expect(result.aoAll).toBe("");
    expect(result.memo).toBe("");
    expect(result.exe).toBe("");
    expect(result.fluid).toBe("");
    expect(result.success).toBe("0/1");
  });

  it("treats persisted string DNFs as DNFs", () => {
    const result = computeSessionAggregateStats(
      [
        {
          DNF: "true",
          time_solve: 12.34,
          memo_time: 1.23,
          exe_time: 11.11,
          fluidness: null,
        },
        {
          DNF: false,
          time_solve: 10,
          memo_time: 2,
          exe_time: 8,
          fluidness: 80,
        },
      ],
      helpers
    );

    expect(result.current).toBe(10);
    expect(result.aoAll).toBe(10);
    expect(result.success).toBe("1/2");
  });

  const solvesFor = (times) => times.map((time) => ({
    time_solve: time,
    DNF: time === "DNF",
    memo_time: Number(time) / 4,
    exe_time: Number(time) * 3 / 4,
  }));

  it("uses the latest five attempts and trims one best/worst result", () => {
    const result = computeSessionAggregateStats(solvesFor([999, 1, 10, 20, 30, 100]));
    expect(result.ao5).toBe(20);
    expect(result.current).toBe(100);
    expect(computeSessionAggregateStats(solvesFor([10, 20, 30, 40])).ao5).toBe("");
  });

  it("includes DNFs in the rolling window and permits only one in an Ao5", () => {
    const solves = solvesFor([1, 10, 20, 30, 40, "DNF"]);
    solves[5].DNF = "true";
    expect(computeSessionAggregateStats(solves).ao5).toBe(30);
    solves[4].DNF = true;
    expect(computeSessionAggregateStats(solves).ao5).toBe("DNF");
    expect(computeSessionAggregateStats(solvesFor(["DNF", "DNF", "DNF", "DNF", "DNF"])).ao5).toBe("DNF");
  });

  it("calculates Ao50 from 50 attempts with three trimmed at each end", () => {
    const solves = solvesFor([9999, ...Array.from({ length: 50 }, (_, i) => i + 1)]);
    const result = computeSessionAggregateStats(solves);
    expect(result.ao50).toBe(25.5);
    expect(result.aoAll).not.toBe(result.ao50);
    expect(computeSessionAggregateStats(solves.slice(-49)).ao50).toBe("");
    solves.slice(-3).forEach((solve) => { solve.DNF = true; });
    expect(computeSessionAggregateStats(solves).ao50).toBe(25.5);
    solves[solves.length - 4].DNF = true;
    expect(computeSessionAggregateStats(solves).ao50).toBe("DNF");
  });

  it("keeps means and split averages separate from the latest solve", () => {
    const result = computeSessionAggregateStats(solvesFor([10, 20, 60, "DNF"]));
    expect(result.current).toBe("DNF(DNF)");
    expect(result.aoAll).toBe(30);
    expect(result.memo).toBe(7.5);
    expect(result.exe).toBe(22.5);
    expect(result.mo3).toBe("DNF");
  });

  it("treats missing and invalid times as failed attempts in rolling averages", () => {
    expect(calculateTrimmedAverage(solvesFor([1, 10, 20, 30, null]))).toBe(20);
    expect(calculateTrimmedAverage(solvesFor([1, 10, 20, null, "invalid"]))).toBe("DNF");
    expect(computeSessionAggregateStats([]).ao50).toBe("");
  });

  it("recalculates best windows for each session, including after deletion", () => {
    const first = computeSessionBestStats(solvesFor([1, 10, 20, 30, 100]));
    expect(first.bao5.time).toBe(20);
    expect(first.best.time).toBe(1);
    const second = computeSessionBestStats(solvesFor([50, 60, 70, 80, 90]));
    expect(second.bao5.time).toBe(70);
    expect(computeSessionBestStats(solvesFor([50, 60, 70, 80])).bao5.time).toBe(10000);
  });
});
