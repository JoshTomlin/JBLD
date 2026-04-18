const { computeSessionAggregateStats, averageValues } = require("./solveAverages");

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
});
