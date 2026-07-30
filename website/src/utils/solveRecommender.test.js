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

function placePiece(slotMap, slot, piece, orientation = 0) {
  const rotateLeft = (value, amount) => value.slice(amount) + value.slice(0, amount);
  const orientedPiece = rotateLeft(piece, orientation);
  for (let index = 0; index < slot.length; index += 1) {
    slotMap[rotateLeft(slot, index)] = rotateLeft(orientedPiece, index);
  }
}

describe("solveRecommender", () => {
  it("traces a buffer-led edge cycle into letter targets", () => {
    const pieces = ["UF", "UR", "UB", "UL"];
    const slotMap = solvedMapForPieces(pieces);
    placePiece(slotMap, "UF", "UR");
    placePiece(slotMap, "UR", "UB");
    placePiece(slotMap, "UB", "UF");

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
    placePiece(slotMap, "UB", "UL");
    placePiece(slotMap, "UL", "DF");
    placePiece(slotMap, "DF", "UB");

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", UR: "B", UB: "A", UL: "D", DF: "U" },
      cycleBreakPreferences: ["D", "A"],
    });

    expect(result.targets[0]).toBe("D");
    expect(result.cycleBreaks).toEqual(["D"]);
    expect(result.targets).toEqual(["D", "U", "A", "D"]);
    expect(result.solved).toBe(true);
  });

  it("swaps whole cubies so oriented cycles cannot get stuck repeating one target", () => {
    const pieces = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];
    const slotMap = solvedMapForPieces(pieces);
    Object.assign(slotMap, {
      UF: "BU", FU: "UB",
      UR: "LB", RU: "BL",
      UB: "BR", BU: "RB",
      UL: "RU", LU: "UR",
      DF: "UL", FD: "LU",
      DR: "DF", RD: "FD",
      FR: "UF", RF: "FU",
      FL: "DR", LF: "RD",
      BR: "FR", RB: "RF",
      BL: "LF", LB: "FL",
    });

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: {
        UB: "A", UR: "B", UF: "C", UL: "D", LU: "E", LF: "F", LD: "G", LB: "H",
        FU: "I", FR: "J", FD: "K", FL: "L", RU: "M", RB: "N", RD: "O", RF: "P",
        BU: "Q", BL: "R", BD: "S", BR: "T", DF: "U", DR: "V", DB: "W", DL: "X",
      },
      cycleBreakPreferences: ["B", "A", "D"],
    });

    expect(result.targets).toEqual(["Q", "N", "P", "B", "H", "L", "V", "U", "D", "M"]);
    expect(result.cycleBreaks).toEqual(["B"]);
    expect(result.targets.length).toBeLessThan(20);
    expect(result.solved).toBe(true);
  });

  it("traces other cycles even when the buffer piece starts flipped", () => {
    const pieces = ["UF", "UR", "UB", "UL"];
    const slotMap = solvedMapForPieces(pieces);
    placePiece(slotMap, "UF", "UF", 1);
    placePiece(slotMap, "UB", "UL");
    placePiece(slotMap, "UL", "UB");

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", FU: "I", UB: "A", UL: "D" },
      cycleBreakPreferences: ["A", "D"],
    });

    expect(result.targets).toEqual(["A", "D", "A"]);
    expect(result.cycleBreaks).toEqual(["A"]);
    expect(result.solved).toBe(true);
  });

  it("does not use already solved pieces as cycle breaks", () => {
    const pieces = ["UF", "UR", "UB", "UL"];
    const slotMap = solvedMapForPieces(pieces);
    placePiece(slotMap, "UB", "UL");
    placePiece(slotMap, "UL", "UB");

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", UR: "B", UB: "A", UL: "D" },
      cycleBreakPreferences: ["B", "A", "D"],
    });

    expect(result.targets[0]).toBe("A");
    expect(result.cycleBreaks).toEqual(["A"]);
    expect(result.solved).toBe(true);
  });

  it("uses an explicit cycle-break override and exposes the valid alternatives", () => {
    const pieces = ["UF", "UR", "UB", "UL", "DF"];
    const slotMap = solvedMapForPieces(pieces);
    placePiece(slotMap, "UB", "UL");
    placePiece(slotMap, "UL", "DF");
    placePiece(slotMap, "DF", "UB");

    const result = traceMemoTargetsFromSlotMap({
      slotMap,
      buffer: "UF",
      pieces,
      letterPairs: { UF: "C", UR: "B", UB: "A", UL: "D", DF: "U" },
      cycleBreakPreferences: ["D", "A"],
      cycleBreakOverrides: ["UB"],
    });

    expect(result.targets).toEqual(["A", "D", "U", "A"]);
    expect(result.cycleBreaks).toEqual(["A"]);
    expect(result.targetDetails[0]).toMatchObject({
      letter: "A",
      sticker: "UB",
      isCycleBreak: true,
      cycleBreakIndex: 0,
    });
    expect(result.targetDetails[0].choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sticker: "UB", letter: "A" }),
        expect.objectContaining({ sticker: "UL", letter: "D" }),
      ])
    );
    expect(result.solved).toBe(true);
  });
});
