jest.mock("cubing/alg", () => ({
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
        EDGES: { permutation: Array.from({ length: 12 }, (_, index) => index), orientation: new Array(12).fill(0) },
        CORNERS: { permutation: Array.from({ length: 8 }, (_, index) => index), orientation: new Array(8).fill(0) },
        CENTERS: { permutation: Array.from({ length: 6 }, (_, index) => index), orientation: new Array(6).fill(0) },
      };
    }

    applyMove() {}
  },
}));

jest.mock("cubing/puzzles", () => ({
  experimentalCube3x3x3KPuzzle: {},
}));

const { traceMemoTargetsFromSlotMap } = require("./solveRecommender");

function solvedMapForPieces(pieces) {
  const rotateLeft = (value, amount) => value.slice(amount) + value.slice(0, amount);
  return pieces.reduce((map, piece) => {
    for (let index = 0; index < piece.length; index += 1) {
      const sticker = rotateLeft(piece, index);
      map[sticker] = sticker;
    }
    return map;
  }, {});
}

describe("solveRecommender", () => {
  it("traces a buffer-led edge cycle into letter targets", () => {
    const pieces = ["UF", "UR", "UB", "UL"];
    const slotMap = solvedMapForPieces(pieces);
    slotMap.UF = "UR";
    slotMap.UR = "UB";
    slotMap.UB = "UF";

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", UR: "B", UB: "A", UL: "D" },
      cycleBreakPreferences: ["B", "A", "D"],
    });

    expect(result.targets).toEqual(["B", "A"]);
    expect(result.cycleBreaks).toEqual([]);
    expect(result.solved).toBe(true);
  });

  it("uses configured cycle-break priority when the buffer is solved", () => {
    const pieces = ["UF", "UR", "UB", "UL", "DF"];
    const slotMap = solvedMapForPieces(pieces);
    slotMap.UB = "UL";
    slotMap.UL = "DF";
    slotMap.DF = "UB";

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", UR: "B", UB: "A", UL: "D", DF: "U" },
      cycleBreakPreferences: ["D", "A"],
    });

    expect(result.targets[0]).toBe("D");
    expect(result.cycleBreaks).toEqual(["D"]);
    expect(result.solved).toBe(true);
  });
});