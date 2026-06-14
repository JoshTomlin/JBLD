const { expandCommNotation, hasCommNotation, normalizeNotationText } = require("./commNotation");

describe("commNotation", () => {
  it("detects commutator-style notation", () => {
    expect(hasCommNotation("[R U R', D]")).toBe(true);
    expect(hasCommNotation("R U R'")).toBe(false);
  });

  it("normalizes spacing around commutator punctuation", () => {
    expect(normalizeNotationText("[R' D' R,U2]")).toBe("[ R' D' R , U2 ]");
  });

  it("expands a commutator", () => {
    expect(expandCommNotation("[R' D' R , U2]", { simplify: false })).toBe(
      "R' D' R U2 R' D R U2"
    );
  });

  it("expands a conjugated commutator and preserves cancellations", () => {
    expect(expandCommNotation("[U' : [R D R' , U2]]")).toBe(
      "U' R D R' U2 R D' R' U'"
    );
  });

  it("handles nested workbook notation with cancellations across boundaries", () => {
    expect(expandCommNotation("[R' B' R : [R D R' , U']]")).toBe(
      "R' B' R2 D R' U' R D' R' U R' B R"
    );
  });
});
