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
  invertTransformation: jest.fn(),
}));

jest.mock("cubing/puzzles", () => ({
  experimentalCube3x3x3KPuzzle: {},
}));

jest.mock("./localCommParser", () => {
  const actual = jest.requireActual("./localCommParser");
  return {
    ...actual,
    buildLocalCommAnalysis: jest.fn(() => ({
      rotationPrefix: "y",
      commStats: [
        {
          comm_index: 1,
          phase: "edge",
          piece_type: "edge",
          buffer_target: "C",
          target_a: "B",
          target_b: "A",
          special_type: null,
          alg: "R U R' U'",
          alg_length: 4,
          move_start_index: 1,
          move_end_index: 4,
          parse_text: "BA",
        },
      ],
      parsed: true,
      solved: true,
      solveStates: [],
    })),
  };
});

const {
  getOrientationData,
  parseSolvedToComm,
  similarityRatio,
  toCanonicalStickerName,
} = require("./localCommParser");
const { buildCubedbUrl } = require("./localSolveParser");

const baseSetting = {
  DATE_SOLVE: "4/3/2026, 06:03 PM",
  MEMO: "0.69",
  TIME_SOLVE: "2.76",
  EDGES_BUFFER: "UF",
  CORNER_BUFFER: "UFR",
  CUBE_OREINTATION: "white-green",
  DIFF_BETWEEN_ALGS: "0.87",
  PARSE_TO_LETTER_PAIR: true,
  LETTER_PAIRS_DICT: JSON.stringify({
    UBL: "A",
    UBR: "B",
    UFR: "C",
    UFL: "D",
    LBU: "E",
    LFU: "F",
    LFD: "G",
    LDB: "H",
    FUL: "I",
    FUR: "J",
    FRD: "K",
    FDL: "L",
    RFU: "M",
    RBU: "N",
    RBD: "O",
    RFD: "P",
    BUR: "Q",
    BUL: "R",
    BLD: "S",
    BRD: "T",
    DFL: "U",
    DFR: "V",
    DBR: "W",
    DBL: "X",
    UB: "A",
    UR: "B",
    UF: "C",
    UL: "D",
    LU: "E",
    LF: "F",
    LD: "G",
    LB: "H",
    FU: "I",
    FR: "J",
    FD: "K",
    FL: "L",
    RU: "M",
    RB: "N",
    RD: "O",
    RF: "P",
    BU: "Q",
    BL: "R",
    BD: "S",
    BR: "T",
    DF: "U",
    DR: "V",
    DB: "W",
    DL: "X",
  }),
  SCRAMBLE: "R U' R' D R U R' D'",
  SOLVE: "D R U' R' D' R U R'",
  SOLVE_TIME_MOVES: [],
};

describe("localCommParser", () => {
  it("returns the correct CubeDB rotation prefix for the chosen orientation", () => {
    expect(getOrientationData("white-red").rotationPrefix).toBe("y");
    expect(getOrientationData("blue-white").rotationPrefix).toBe("x'");
  });

  it("reconstructs a buffer-led edge cycle from changed sticker states", () => {
    const { comm, pieceType } = parseSolvedToComm(
      {
        UF: ["UR", "UF"],
        UR: ["UB", "UR"],
        UB: ["UF", "UB"],
      },
      { edgeBuffer: "UF", cornerBuffer: "UFR" }
    );

    expect(pieceType).toEqual({ edge: true, corner: false, parity: false });
    expect(comm).toEqual(["UF", "UR", "UB"]);
  });

  it("marks combined edge and corner cycles as parity", () => {
    const { comm, pieceType } = parseSolvedToComm(
      {
        UF: ["UR", "UF"],
        UR: ["UF", "UR"],
        UFR: ["UBR", "UFR"],
        UBR: ["UFR", "UBR"],
      },
      { edgeBuffer: "UF", cornerBuffer: "UFR" }
    );

    expect(pieceType).toEqual({ edge: false, corner: false, parity: true });
    expect(comm).toEqual(["UF", "UR", "UFR", "UBR"]);
  });

  it("detects non-buffer edge flips without falling back to floating", () => {
    const { comm, pieceType } = parseSolvedToComm(
      {
        UR: ["RU", "UR"],
        RU: ["UR", "RU"],
        UF: ["FU", "UF"],
        FU: ["UF", "FU"],
      },
      { edgeBuffer: "UF", cornerBuffer: "UFR" }
    );

    expect(pieceType).toEqual({ edge: true, corner: false, parity: false });
    expect(comm).toEqual(["UF", "UR", "flip"]);
  });

  it("detects non-buffer corner twists without falling back to floating", () => {
    const { comm, pieceType } = parseSolvedToComm(
      {
        UBR: ["BRU", "UBR"],
        BRU: ["UBR", "BRU"],
        UFR: ["RFU", "UFR"],
        RFU: ["UFR", "RFU"],
      },
      { edgeBuffer: "UF", cornerBuffer: "UBL" }
    );

    expect(pieceType).toEqual({ edge: false, corner: true, parity: false });
    expect(comm).toEqual(["UFR", "UBR", "twist"]);
  });

  it("adds the orientation prefix to the local CubeDB link", () => {
    const result = buildCubedbUrl({
      scramble: baseSetting.SCRAMBLE,
      solve: baseSetting.SOLVE,
      title: "test solve",
      execTime: 2.07,
      rotationPrefix: "y",
    });

    expect(decodeURIComponent(result).replace(/\+/g, " ")).toContain("alg=y // memo");
  });

  it("scores identical sticker sequences as fully similar", () => {
    expect(similarityRatio(["UF", "UR", "UB"], ["UF", "UR", "UB"])).toBe(1);
  });

  it("normalizes cubing corner names to the app's letter-pair keys", () => {
    expect(toCanonicalStickerName("URB")).toBe("UBR");
    expect(toCanonicalStickerName("DRF")).toBe("DFR");
    expect(toCanonicalStickerName("ULF")).toBe("UFL");
  });
});
