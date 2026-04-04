jest.mock("cubing/alg", () => {
  class MockAlg {
    constructor(value) {
      this.value = value.replace(/\s+/g, " ").trim();
    }

    expand() {
      this.value = this.value.replace(/\(([^()]+)\)([2-4])/g, (_, inner, reps) =>
        Array.from({ length: Number(reps) }, () => inner.trim()).join(" ")
      );
      return this;
    }

    simplify() {
      this.value = this.value.replace(/\s+/g, " ").trim();
      return this;
    }

    toString() {
      return this.value;
    }
  }

  return { Alg: MockAlg };
});

jest.mock("cubing/notation", () => ({
  countMoves: (alg) => alg.toString().split(/\s+/).filter(Boolean).length,
}));

const { buildSolveAnalysis, parseSolve, toCanonicalAlg } = require("./bldParser");

describe("bldParser", () => {
  it("parses exported solve text into local comm stats", () => {
    const solveText = [
      "26/21 30.48(1.39,29.09)  82.3%",
      "4/3/2026",
      "Scramble:",
      "R U F",
      "",
      "Solve:",
      "[D: [L D' L', U']] // AB  5/12  1.24",
      "[R U R': [S, R2]] // UFUB  9/18  2.02",
      "[U R U': [S, R2]] // parity  11/22  2.35",
    ].join("\n");

    const result = buildSolveAnalysis(solveText);

    expect(result.commCount).toBe(3);
    expect(result.commStats).toEqual([
      expect.objectContaining({
        comm_index: 1,
        phase: "unknown",
        target_a: "A",
        target_b: "B",
      }),
      expect.objectContaining({
        comm_index: 2,
        phase: "edge",
        target_a: "UF",
        target_b: "UB",
      }),
      expect.objectContaining({
        comm_index: 3,
        phase: "parity",
      }),
    ]);
    expect(result.moveTimeline.length).toBeGreaterThan(0);
  });

  it("respects explicit section headings", () => {
    const result = parseSolve([
      "edges",
      "[R, U] // AB",
      "corners",
      "[L' U: [F2, U' L U L']] // UBLUFR",
    ].join("\n"));

    expect(result.commStats[0]).toEqual(
      expect.objectContaining({
        phase: "edge",
        target_a: "A",
        target_b: "B",
      })
    );
    expect(result.commStats[1]).toEqual(
      expect.objectContaining({
        phase: "corner",
        target_a: "UBL",
        target_b: "UFR",
      })
    );
  });

  it("normalizes repeated groups with cubing.js", () => {
    expect(toCanonicalAlg("(R U)2 (L U)2")).toBe("R U R U L U L U");
  });

  it("formats parity, flips, and rotations with readable labels", () => {
    const result = parseSolve([
      "edges",
      "[R U R', M'] // URUF flip",
      "corners",
      "[R' D' R, U] // UBRUFR twist",
      "parity",
      "[U R U': [S, R2]] // parity UFUR UFRUBR",
    ].join("\n"));

    expect(result.commStats[0]).toEqual(
      expect.objectContaining({
        phase: "edge",
        special_type: "flip",
        target_a: "UR",
        target_b: "UF",
        parse_text: "URUF flip",
      })
    );
    expect(result.commStats[1]).toEqual(
      expect.objectContaining({
        phase: "corner",
        special_type: "rotation",
        target_a: "UBR",
        target_b: "UFR",
        parse_text: "UBRUFR rotation",
      })
    );
    expect(result.commStats[2]).toEqual(
      expect.objectContaining({
        phase: "parity",
        special_type: "parity",
        parse_text: "UBR Parity",
      })
    );
  });

  it("labels parity by the non-buffer corner target", () => {
    const result = parseSolve("[U R U': [S, R2]] // parity UFUR UFRUBL", {
      cornerBuffer: "UFR",
    });

    expect(result.commStats[0]).toEqual(
      expect.objectContaining({
        phase: "parity",
        special_type: "parity",
        parse_text: "UBL Parity",
      })
    );
  });
});
