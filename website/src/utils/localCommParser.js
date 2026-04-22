import { Move } from "cubing/alg";
import { KPuzzle } from "cubing/kpuzzle";
import { experimentalCube3x3x3KPuzzle } from "cubing/puzzles";

const cubeDefinition = experimentalCube3x3x3KPuzzle;
const rotationMoves = new Set(["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"]);
const reidEdgeOrder = "UF UR UB UL DF DR DB DL FR FL BR BL".split(" ");
const reidCornerOrder = "UFR URB UBL ULF DRF DFL DLB DBR".split(" ");
const centerOrder = "U L F R B D".split(" ");
const canonicalStickerNames = {
  UFR: "UFR",
  URF: "UFR",
  URB: "UBR",
  UBL: "UBL",
  ULF: "UFL",
  RFU: "RFU",
  RUF: "RFU",
  RBU: "RBU",
  RUB: "RBU",
  RFD: "RFD",
  RDF: "RFD",
  RBD: "RBD",
  RDB: "RBD",
  BUR: "BUR",
  BRU: "BUR",
  BUL: "BUL",
  BLU: "BUL",
  FUR: "FUR",
  FRU: "FUR",
  FUL: "FUL",
  FLU: "FUL",
  DFR: "DFR",
  DRF: "DFR",
  DFL: "DFL",
  DLF: "DFL",
  DBR: "DBR",
  DRB: "DBR",
  DBL: "DBL",
  DLB: "DBL",
  BRD: "BRD",
  BDR: "BRD",
  BLD: "BLD",
  BDL: "BLD",
  FRD: "FRD",
  FDR: "FRD",
  FDL: "FDL",
  FLD: "FDL",
  LBU: "LBU",
  LUB: "LBU",
  LFU: "LFU",
  LUF: "LFU",
  LDB: "LDB",
  LBD: "LDB",
  LFD: "LFD",
  LDF: "LFD",
};
const orientationDict = {
  "white-green": "",
  "white-blue": "y2",
  "white-orange": "y'",
  "white-red": "y",
  "green-white": "y2 x'",
  "green-yellow": "x",
  "green-orange": "x y'",
  "green-red": "x y",
  "yellow-green": "z2",
  "yellow-blue": "x2",
  "yellow-orange": "z2 y",
  "yellow-red": "x2 y",
  "blue-white": "x'",
  "blue-yellow": "x' y2",
  "blue-orange": "x' y'",
  "blue-red": "x' y",
  "orange-white": "z y",
  "orange-green": "z",
  "orange-yellow": "z y'",
  "orange-blue": "y2 z'",
  "red-white": "z' y'",
  "red-green": "z'",
  "red-yellow": "z' y",
  "red-blue": "y2 z'",
};

const inverseRotationMap = {
  x: "x'",
  "x'": "x",
  x2: "x2",
  y: "y'",
  "y'": "y",
  y2: "y2",
  z: "z'",
  "z'": "z",
  z2: "z2",
};
const orientationRotationSequences = Array.from(
  new Set(Object.values(orientationDict).map((value) => (value || "").trim()))
);

const translationMaps = {
  y: {
    R: "B",
    r: "b",
    B: "L",
    b: "l",
    L: "F",
    l: "f",
    F: "R",
    f: "r",
    M: "S",
    z: "x",
    S: "M'",
    x: "z'",
  },
  x: {
    U: "F",
    u: "f",
    F: "D",
    f: "d",
    D: "B",
    d: "b",
    B: "U",
    b: "u",
    S: "E",
    E: "S'",
    y: "z",
    z: "y'",
  },
  z: {
    R: "U",
    r: "u",
    U: "L",
    u: "l",
    L: "D",
    l: "d",
    D: "R",
    d: "r",
    M: "E",
    E: "M'",
    x: "y",
    y: "x'",
  },
};

const stickerIdentityOrder = [
  ...reidEdgeOrder.flatMap((piece) => [piece, rotateLeft(piece, 1)]),
  ...reidCornerOrder.flatMap((piece) => [
    piece,
    rotateLeft(piece, 1),
    rotateLeft(piece, 2),
  ]),
  ...centerOrder,
];

function rotateLeft(value, amount) {
  if (!value) {
    return value;
  }

  const normalizedAmount = ((amount % value.length) + value.length) % value.length;
  return value.slice(normalizedAmount) + value.slice(0, normalizedAmount);
}

export function toCanonicalStickerName(sticker) {
  return canonicalStickerNames[sticker] || sticker;
}

function splitMoves(algText = "") {
  return algText
    .trim()
    .split(/\s+/)
    .map((move) => move.trim())
    .filter(Boolean);
}

function normalizeMoveToken(move) {
  return move.replace(/’/g, "'");
}

function canonicalizeWideMoveToken(move) {
  const normalized = normalizeMoveToken(move);
  const match = normalized.match(/^(\d+)?([URFDLBurfdlb])(w?)(2|')?$/);
  if (!match) {
    return normalized;
  }

  const [, layers, face, wideMarker, suffix = ""] = match;
  if (layers && layers !== "2") {
    return normalized;
  }

  if (wideMarker || face === face.toLowerCase()) {
    return `${face.toLowerCase()}${suffix}`;
  }

  return normalized;
}

function canonicalizeMoveTokens(tokens) {
  return tokens.map(canonicalizeWideMoveToken);
}

function hasExplicitWideOrSliceMoves(tokens) {
  return tokens.some((token) => {
    const normalized = normalizeMoveToken(token);
    if (!normalized) {
      return false;
    }

    if (/^[MESmes]/.test(normalized)) {
      return true;
    }

    return /^[urfdlb]/.test(normalized);
  });
}

function translateAlgorithm(tokens, translation) {
  return tokens
    .join(" ")
    .split("")
    .map((char) => (char in translation ? translation[char] : char))
    .join("")
    .replace(/''/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function applyRotationToTokens(tokens, rotation) {
  if (!rotation || !translationMaps[rotation[0]]) {
    return tokens.slice();
  }

  let next = tokens.slice();
  const baseRotation = rotation[0];
  const amount = rotation.endsWith("2") ? 2 : rotation.endsWith("'") ? 3 : 1;

  for (let i = 0; i < amount; i += 1) {
    next = translateAlgorithm(next, translationMaps[baseRotation]);
  }

  return next;
}

function parseRotationFromAlg(tokens) {
  const remaining = tokens.slice();
  let normalized = remaining.slice();

  while (normalized.length && rotationMoves.has(normalized[0])) {
    const [rotation, ...rest] = normalized;
    normalized = applyRotationToTokens(rest, rotation);
  }

  return normalized;
}

function slicePairToRotation(first, second) {
  const pair = [first, second].sort().join(" ");
  const directPairs = {
    "D U'": ["E'", "y'"],
    "D' U": ["E", "y"],
    "L' R": ["M", "x"],
    "L R'": ["M'", "x'"],
    "B' F": ["S'", "z"],
    "B F'": ["S", "z'"],
  };

  return directPairs[pair] || null;
}

function normalizeSmartCubeSlicePairs(tokens) {
  const sliced = [];
  let index = 0;

  while (index < tokens.length) {
    const slicePair =
      index + 1 < tokens.length ? slicePairToRotation(tokens[index], tokens[index + 1]) : null;
    if (slicePair) {
      sliced.push(...slicePair);
      index += 2;
    } else {
      sliced.push(tokens[index]);
      index += 1;
    }
  }

  const output = [];
  let remainder = sliced.slice();
  while (remainder.length) {
    const token = remainder.shift();
    if (rotationMoves.has(token)) {
      remainder = applyRotationToTokens(remainder, token);
    } else {
      output.push(token);
    }
  }

  return output;
}

export function getOrientationData(orientation = "yellow-green") {
  const orientationRotations = splitMoves(orientationDict[orientation] || "");
  const inverseRotations = orientationRotations
    .map((rotation) => inverseRotationMap[rotation] || rotation)
    .reverse();

  return {
    rotationPrefix: orientationRotations.join(" "),
    normalizationRotations: inverseRotations,
  };
}

export function normalizeForOrientation(scramble, solve, orientation = "yellow-green") {
  const { rotationPrefix, normalizationRotations } = getOrientationData(orientation);
  const scrambleTokens = canonicalizeMoveTokens(splitMoves(scramble));
  const solveTokens = canonicalizeMoveTokens(splitMoves(solve));
  const normalizedScramble = parseRotationFromAlg([...normalizationRotations, ...scrambleTokens]);
  const normalizedSolveBase = parseRotationFromAlg([...normalizationRotations, ...solveTokens]);
  const normalizedSolve = hasExplicitWideOrSliceMoves(solveTokens)
    ? normalizedSolveBase
    : normalizeSmartCubeSlicePairs(normalizedSolveBase);

  return {
    scrambleTokens: normalizedScramble,
    solveTokens: normalizedSolve,
    rotationPrefix,
  };
}

function toReidStruct(state) {
  const output = [[], [], []];

  for (let i = 0; i < 12; i += 1) {
    output[0].push(
      rotateLeft(
        reidEdgeOrder[state.EDGES.permutation[i]],
        state.EDGES.orientation[i]
      )
    );
  }

  for (let i = 0; i < 8; i += 1) {
    output[1].push(
      rotateLeft(
        reidCornerOrder[state.CORNERS.permutation[i]],
        state.CORNERS.orientation[i]
      )
    );
  }

  output[2] = centerOrder.slice();
  return output;
}

function buildSlotStickerMap(state) {
  const reid = toReidStruct(state);
  const slotMap = {};

  reidEdgeOrder.forEach((slotName, index) => {
    const piece = reid[0][index];
    slotMap[slotName] = piece;
    slotMap[rotateLeft(slotName, 1)] = rotateLeft(piece, 1);
  });

  reidCornerOrder.forEach((slotName, index) => {
    const piece = reid[1][index];
    slotMap[slotName] = piece;
    slotMap[rotateLeft(slotName, 1)] = rotateLeft(piece, 1);
    slotMap[rotateLeft(slotName, 2)] = rotateLeft(piece, 2);
  });

  centerOrder.forEach((center) => {
    slotMap[center] = center;
  });

  return slotMap;
}

function stateToSlotTokens(state) {
  const slotMap = buildSlotStickerMap(state);
  return stickerIdentityOrder.map((label) => slotMap[label] || label);
}

function countSolvedEdges(state) {
  return state.EDGES.permutation.reduce(
    (count, pieceIndex, index) =>
      count + (pieceIndex === index && state.EDGES.orientation[index] === 0 ? 1 : 0),
    0
  );
}

function countSolvedCorners(state) {
  return state.CORNERS.permutation.reduce(
    (count, pieceIndex, index) =>
      count + (pieceIndex === index && state.CORNERS.orientation[index] === 0 ? 1 : 0),
    0
  );
}

function longestCommonBlock(a, b, aStart, aEnd, bStart, bEnd) {
  let bestA = aStart;
  let bestB = bStart;
  let bestSize = 0;
  const index = new Map();

  for (let i = bStart; i < bEnd; i += 1) {
    const token = b[i];
    const entries = index.get(token) || [];
    entries.push(i);
    index.set(token, entries);
  }

  const lengths = new Map();

  for (let i = aStart; i < aEnd; i += 1) {
    const nextLengths = new Map();
    const matches = index.get(a[i]) || [];

    for (const j of matches) {
      if (j < bStart || j >= bEnd) {
        continue;
      }

      const size = (lengths.get(j - 1) || 0) + 1;
      nextLengths.set(j, size);
      if (size > bestSize) {
        bestSize = size;
        bestA = i - size + 1;
        bestB = j - size + 1;
      }
    }

    nextLengths.forEach((value, key) => lengths.set(key, value));
  }

  return { aStart: bestA, bStart: bestB, size: bestSize };
}

function matchingBlocks(a, b, aStart, aEnd, bStart, bEnd, output) {
  const match = longestCommonBlock(a, b, aStart, aEnd, bStart, bEnd);

  if (!match.size) {
    return;
  }

  if (aStart < match.aStart && bStart < match.bStart) {
    matchingBlocks(a, b, aStart, match.aStart, bStart, match.bStart, output);
  }

  output.push(match);

  if (match.aStart + match.size < aEnd && match.bStart + match.size < bEnd) {
    matchingBlocks(
      a,
      b,
      match.aStart + match.size,
      aEnd,
      match.bStart + match.size,
      bEnd,
      output
    );
  }
}

export function similarityRatio(a, b) {
  const matches = [];
  matchingBlocks(a, b, 0, a.length, 0, b.length, matches);
  const matchedSize = matches.reduce((sum, match) => sum + match.size, 0);
  return a.length + b.length ? (2 * matchedSize) / (a.length + b.length) : 1;
}

function diffSolvedState(previousTokens, currentTokens) {
  const changed = {};

  for (let i = 0; i < stickerIdentityOrder.length; i += 1) {
    if (previousTokens[i] !== currentTokens[i]) {
      changed[stickerIdentityOrder[i]] = [previousTokens[i], currentTokens[i]];
    }
  }

  return changed;
}

function isSamePiece(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  return a.split("").every((char) => b.includes(char));
}

function isSamePieceInList(target, items) {
  return items.some((item) => isSamePiece(item, target));
}

function pickRepresentativeSticker(stickers, order) {
  return order.find((candidate) => stickers.some((sticker) => isSamePiece(sticker, candidate))) || stickers[0] || null;
}

function orientedStickersForPiece(piece) {
  return [piece, rotateLeft(piece, 1), rotateLeft(piece, 2)];
}

function pickCornerTwistLabelSticker(piece) {
  return (
    orientedStickersForPiece(piece).find((sticker) => sticker[0] === "U" || sticker[0] === "D") ||
    pickRepresentativeSticker([piece], reidCornerOrder)
  );
}

function pickEdgeFlipLabelSticker(piece) {
  const stickers = [piece, rotateLeft(piece, 1)];
  return (
    stickers.find((sticker) => sticker[0] === "U" || sticker[0] === "D") ||
    stickers.find((sticker) => sticker[0] === "F" || sticker[0] === "B") ||
    pickRepresentativeSticker([piece], reidEdgeOrder)
  );
}

function uniquePiecesForStickers(stickers) {
  return stickers.reduce((pieces, sticker) => {
    if (!isSamePieceInList(sticker, pieces)) {
      pieces.push(sticker);
    }
    return pieces;
  }, []);
}

function sortPiecesByOrder(pieces, order) {
  return pieces.slice().sort((a, b) => {
    const aIndex = order.findIndex((candidate) => isSamePiece(candidate, a));
    const bIndex = order.findIndex((candidate) => isSamePiece(candidate, b));
    return aIndex - bIndex;
  });
}

function changedPiecesForType(lastSolvedPieces, pieceLength, order) {
  return sortPiecesByOrder(
    uniquePiecesForStickers(
      Object.keys(lastSolvedPieces).filter((sticker) => sticker.length === pieceLength)
    ),
    order
  );
}

function stickersForPiece(piece, stickers) {
  return stickers.filter((sticker) => isSamePiece(sticker, piece));
}

function pickCornerTwistRepresentative(piece) {
  const representative = pickCornerTwistLabelSticker(piece);
  return representative;
}

function detectBufferThreePieceCase(lastSolvedPieces, buffers) {
  const changedStickers = Object.keys(lastSolvedPieces);
  const hasEdges = changedStickers.some((sticker) => sticker.length === 2);
  const hasCorners = changedStickers.some((sticker) => sticker.length === 3);

  if (hasEdges && hasCorners) {
    return null;
  }

  const buildCase = (pieces, buffer, order, pieceType) => {
    if (pieces.length !== 3 || !isSamePieceInList(buffer, pieces)) {
      return null;
    }

    return {
      comm: [
        buffer,
        ...pieces
          .filter((piece) => !isSamePiece(piece, buffer))
          .map((piece) => toCanonicalStickerName(pickRepresentativeSticker([piece], order))),
      ],
      pieceType,
    };
  };

  if (hasEdges) {
    return buildCase(
      changedPiecesForType(lastSolvedPieces, 2, reidEdgeOrder),
      buffers.edgeBuffer,
      reidEdgeOrder,
      { edge: true, corner: false, parity: false }
    );
  }

  if (hasCorners) {
    return buildCase(
      changedPiecesForType(lastSolvedPieces, 3, reidCornerOrder),
      buffers.cornerBuffer,
      reidCornerOrder,
      { edge: false, corner: true, parity: false }
    );
  }

  return null;
}

function detectFloatingCornerThreePieceCase(lastSolvedPieces, buffers) {
  const changedStickers = Object.keys(lastSolvedPieces);
  const cornerStickers = changedStickers.filter((sticker) => sticker.length === 3);

  if (cornerStickers.length !== changedStickers.length) {
    return null;
  }

  const pieces = changedPiecesForType(lastSolvedPieces, 3, reidCornerOrder);
  if (pieces.length !== 3 || isSamePieceInList(buffers.cornerBuffer, pieces)) {
    return null;
  }

  const representativeComm = pieces.map((piece) =>
    toCanonicalStickerName(pickRepresentativeSticker([piece], reidCornerOrder))
  );

  if (cornerStickers.length !== 3) {
    return {
      comm: representativeComm,
      pieceType: { edge: false, corner: true, parity: false },
    };
  }

  if (pieces.some((piece) => stickersForPiece(piece, cornerStickers).length !== 1)) {
    return null;
  }

  const keyForPiece = (piece) => cornerStickers.find((sticker) => isSamePiece(sticker, piece));
  const startPiece = pieces[0];
  const startKey = keyForPiece(startPiece);
  if (!startKey) {
    return null;
  }

  const comm = [toCanonicalStickerName(pickRepresentativeSticker([startPiece], reidCornerOrder))];
  const startTarget = lastSolvedPieces[startKey][1];
  let currentLabel = lastSolvedPieces[startKey][0];
  let guard = 0;

  while (!isSamePiece(currentLabel, startTarget) && guard < 5) {
    guard += 1;
    const nextKey = cornerStickers.find((sticker) =>
      isSamePiece(lastSolvedPieces[sticker][1], currentLabel)
    );

    if (!nextKey) {
      return null;
    }

    comm.push(
      toCanonicalStickerName(
        pickRepresentativeSticker([nextKey], reidCornerOrder)
      )
    );
    currentLabel = lastSolvedPieces[nextKey][0];
  }

  if (comm.length !== 3 || !isSamePiece(currentLabel, startTarget)) {
    return null;
  }

  return {
    comm,
    pieceType: { edge: false, corner: true, parity: false },
  };
}

function commCoversSamePieces(comm, expectedComm) {
  const commPieces = uniquePiecesForStickers(
    comm.filter((token) => token !== "flip" && token !== "twist")
  );
  const expectedPieces = uniquePiecesForStickers(expectedComm);

  return (
    commPieces.length === expectedPieces.length &&
    expectedPieces.every((piece) => isSamePieceInList(piece, commPieces))
  );
}

function detectNonBufferSpecialCase(lastSolvedPieces) {
  const changedStickers = Object.keys(lastSolvedPieces);
  if (!changedStickers.length) {
    return null;
  }

  const edgeStickers = changedStickers.filter((sticker) => sticker.length === 2);
  const cornerStickers = changedStickers.filter((sticker) => sticker.length === 3);

  if (edgeStickers.length && cornerStickers.length) {
    return null;
  }

  if (edgeStickers.length === 4) {
    const uniquePieces = sortPiecesByOrder(uniquePiecesForStickers(edgeStickers), reidEdgeOrder);

    if (uniquePieces.length === 2) {
      return {
        comm: uniquePieces
          .map((piece) => toCanonicalStickerName(pickEdgeFlipLabelSticker(piece)))
          .concat("flip"),
        pieceType: { edge: true, corner: false, parity: false },
      };
    }
  }

  if (cornerStickers.length === 4 || cornerStickers.length === 6) {
    const uniquePieces = sortPiecesByOrder(uniquePiecesForStickers(cornerStickers), reidCornerOrder);

    if (uniquePieces.length === 2) {
      return {
        comm: uniquePieces
          .map((piece) =>
            toCanonicalStickerName(
              pickCornerTwistRepresentative(
                piece,
                stickersForPiece(piece, cornerStickers),
                lastSolvedPieces
              )
            )
          )
          .concat("twist"),
        pieceType: { edge: false, corner: true, parity: false },
      };
    }
  }

  return null;
}

function detectParityCase(lastSolvedPieces) {
  const summary = changedPieceSummary(lastSolvedPieces);
  if (summary.edges.length !== 2 || summary.corners.length !== 2) {
    return null;
  }

  return {
    comm: [
      ...sortPiecesByOrder(summary.edges, reidEdgeOrder).map((piece) =>
        toCanonicalStickerName(pickRepresentativeSticker([piece], reidEdgeOrder))
      ),
      ...sortPiecesByOrder(summary.corners, reidCornerOrder).map((piece) =>
        toCanonicalStickerName(pickRepresentativeSticker([piece], reidCornerOrder))
      ),
    ],
    pieceType: { edge: false, corner: false, parity: true },
  };
}

function parseCommList(comm, lastSolvedPieces) {
  const first = comm[0];
  const second = comm[1];

  if (!first || !second || !isSamePiece(first, second)) {
    return comm;
  }

  const edgeStickerSet = new Set(
    Object.keys(lastSolvedPieces).filter((key) => key.length === 2)
  );
  const cornerStickerSet = new Set(
    Object.keys(lastSolvedPieces).filter((key) => key.length === 3)
  );
  const found = [first];
  const sourceSet = first.length === 2 ? edgeStickerSet : cornerStickerSet;

  sourceSet.forEach((sticker) => {
    if (!isSamePieceInList(sticker, found)) {
      found.push(sticker);
    }
  });

  found.push(first.length === 2 ? "flip" : "twist");
  return found;
}

function buildParityLabel(tokens, bufferToken, letterPairs = {}) {
  const filtered = tokens.filter(Boolean);
  if (!filtered.length) {
    return "Parity";
  }

  const bufferLetter = letterPairs[bufferToken] || null;
  const target =
    filtered.find((token) => token !== bufferToken && token !== bufferLetter) || filtered[0];
  return `${target} Parity`;
}

export function parseSolvedToComm(lastSolvedPieces, buffers) {
  const { edgeBuffer, cornerBuffer } = buffers;
  const parityCase = detectParityCase(lastSolvedPieces);
  if (parityCase) {
    return parityCase;
  }

  const nonBufferSpecialCase = detectNonBufferSpecialCase(lastSolvedPieces);
  if (nonBufferSpecialCase) {
    return nonBufferSpecialCase;
  }

  const comm = [];
  const pieceType = { edge: false, corner: false, parity: false };

  const appendCycle = (buffer) => {
    comm.push(buffer);
    let currentLabel = lastSolvedPieces[buffer][0];
    let guard = 0;

    while (currentLabel !== lastSolvedPieces[buffer][1] && guard < 20) {
      guard += 1;
      let foundNext = false;
      for (const key of Object.keys(lastSolvedPieces)) {
        if (lastSolvedPieces[key][1] === currentLabel) {
          currentLabel = lastSolvedPieces[key][0];
          comm.push(key);
          foundNext = true;
          break;
        }
      }
      if (!foundNext) {
        break;
      }
    }
  };

  if (edgeBuffer in lastSolvedPieces) {
    pieceType.edge = true;
    appendCycle(edgeBuffer);
  }

  if (cornerBuffer in lastSolvedPieces) {
    pieceType.corner = true;
    appendCycle(cornerBuffer);
  }

  if (pieceType.edge && pieceType.corner) {
    pieceType.parity = true;
    pieceType.edge = false;
    pieceType.corner = false;
  }

  const bufferThreePieceCase = detectBufferThreePieceCase(lastSolvedPieces, buffers);
  if (bufferThreePieceCase && !commCoversSamePieces(comm, bufferThreePieceCase.comm)) {
    return bufferThreePieceCase;
  }

  if (!comm.length) {
    const floatingCornerThreePieceCase = detectFloatingCornerThreePieceCase(
      lastSolvedPieces,
      buffers
    );
    if (floatingCornerThreePieceCase) {
      return floatingCornerThreePieceCase;
    }
  }

  return {
    comm: parseCommList(comm, lastSolvedPieces),
    pieceType,
  };
}

function buildCommentDisplay(comm, pieceType, parseToLetterPair, letterPairs, buffers) {
  const mapToken = (token) =>
    parseToLetterPair && token !== "flip" && token !== "twist"
      ? letterPairs[toCanonicalStickerName(token)] || toCanonicalStickerName(token)
      : toCanonicalStickerName(token);
  const mappedComm = comm.map(mapToken);
  const edgeBufferToken = parseToLetterPair ? letterPairs[buffers.edgeBuffer] || buffers.edgeBuffer : buffers.edgeBuffer;
  const cornerBufferToken = parseToLetterPair ? letterPairs[buffers.cornerBuffer] || buffers.cornerBuffer : buffers.cornerBuffer;

  if (pieceType.parity) {
    const edgeTargets = mappedComm.slice(0, 2);
    const cornerTargets = mappedComm.slice(2);
    return {
      bufferTarget: null,
      targetA: edgeTargets.join(""),
      targetB: cornerTargets.join(""),
      specialType: "parity",
      parseText: buildParityLabel(cornerTargets, cornerBufferToken, letterPairs),
    };
  }

  const isEdge = pieceType.edge;
  const bufferToken = isEdge ? edgeBufferToken : cornerBufferToken;
  const specialType = mappedComm.includes("flip")
    ? "flip"
    : mappedComm.includes("twist")
      ? "rotation"
      : null;

  if (specialType) {
    const relevantTargets = mappedComm.filter((token) => token !== "flip" && token !== "twist");
    return {
      bufferTarget: null,
      targetA: relevantTargets[0] || null,
      targetB: relevantTargets[1] || null,
      specialType,
      parseText: `${relevantTargets.join("")} ${specialType}`.trim(),
    };
  }

  const withoutBuffer =
    mappedComm[0] === bufferToken ? mappedComm.slice(1) : mappedComm.slice();

  return {
    bufferTarget: mappedComm[0] || null,
    targetA: withoutBuffer[0] || null,
    targetB: withoutBuffer[1] || null,
    specialType: null,
    parseText:
      pieceType.edge || pieceType.corner
        ? withoutBuffer.join("")
        : mappedComm.join(" ").trim(),
  };
}

function phaseFromPieceType(pieceType) {
  if (pieceType.edge) {
    return "edge";
  }
  if (pieceType.corner) {
    return "corner";
  }
  if (pieceType.parity) {
    return "parity";
  }
  return "unknown";
}

export function isSingleCommParse(parsed) {
  const comm = Array.isArray(parsed?.comm) ? parsed.comm : [];
  if (!comm.length) {
    return false;
  }

  const phase = phaseFromPieceType(parsed?.pieceType || {});
  if (phase === "edge" || phase === "corner") {
    return comm.length <= 3;
  }

  if (phase === "parity") {
    return comm.length <= 4;
  }

  return false;
}

function shouldRecordCommParse(parsed, spanLength) {
  if (!isSingleCommParse(parsed) || (parsed.comm.length > 3 && spanLength < 8)) {
    return false;
  }

  return true;
}

function changedPieceSummary(lastSolvedPieces) {
  const changedStickers = Object.keys(lastSolvedPieces);
  const edges = uniquePiecesForStickers(changedStickers.filter((sticker) => sticker.length === 2));
  const corners = uniquePiecesForStickers(changedStickers.filter((sticker) => sticker.length === 3));

  return {
    edges,
    corners,
    total: edges.length + corners.length,
    hasMixedPieces: edges.length > 0 && corners.length > 0,
  };
}

function isThreePieceCycleDelta(lastSolvedPieces) {
  const summary = changedPieceSummary(lastSolvedPieces);
  return summary.total === 3 && !summary.hasMixedPieces;
}

function isParityDelta(lastSolvedPieces) {
  const summary = changedPieceSummary(lastSolvedPieces);
  return summary.edges.length === 2 && summary.corners.length === 2;
}

function isSpecialCommParse(parsed) {
  const comm = Array.isArray(parsed?.comm) ? parsed.comm : [];
  return comm.includes("flip") || comm.includes("twist");
}

function isParityCommParse(parsed) {
  return Boolean(parsed?.pieceType?.parity);
}

function buildCommStat({
  parsed,
  algTokens,
  moveStartIndex,
  moveEndIndex,
  commIndex,
  parseToLetterPair,
  letterPairs,
  buffers,
  implicitRotation,
}) {
  const phase = phaseFromPieceType(parsed.pieceType);
  const commentDisplay = buildCommentDisplay(
    parsed.comm,
    parsed.pieceType,
    parseToLetterPair,
    letterPairs,
    buffers
  );

  return {
    comm_index: commIndex,
    phase,
    piece_type: phase,
    buffer_target: commentDisplay.bufferTarget,
    target_a: commentDisplay.targetA,
    target_b: commentDisplay.targetB,
    special_type: commentDisplay.specialType,
    alg: algTokens.join(" "),
    alg_length: algTokens.length,
    move_start_index: moveStartIndex,
    move_end_index: moveEndIndex,
    parse_text: commentDisplay.parseText,
    raw_comm: parsed.comm,
    implicit_rotation: implicitRotation || null,
  };
}

function buildUnknownCommStat({ algTokens, moveStartIndex, moveEndIndex, commIndex }) {
  return {
    comm_index: commIndex,
    phase: "unknown",
    piece_type: "unknown",
    buffer_target: null,
    target_a: null,
    target_b: null,
    special_type: null,
    alg: algTokens.join(" "),
    alg_length: algTokens.length,
    move_start_index: moveStartIndex,
    move_end_index: moveEndIndex,
    parse_text: "?",
    raw_comm: ["?"],
  };
}

function appendUnknownCommStat(comms, { algTokens, moveStartIndex, moveEndIndex }) {
  if (!algTokens.length) {
    return;
  }

  const previous = comms[comms.length - 1];
  if (
    previous &&
    previous.phase === "unknown" &&
    Number(previous.move_end_index) + 1 === moveStartIndex
  ) {
    previous.alg = [previous.alg, algTokens.join(" ")].filter(Boolean).join(" ");
    previous.alg_length = splitMoves(previous.alg).length;
    previous.move_end_index = moveEndIndex;
    return;
  }

  comms.push(
    buildUnknownCommStat({
      algTokens,
      moveStartIndex,
      moveEndIndex,
      commIndex: comms.length + 1,
    })
  );
}

function shouldAcceptCommSegment(lastSolvedPieces, parsed, spanLength) {
  return (
    spanLength >= 4 &&
    (
      isThreePieceCycleDelta(lastSolvedPieces) ||
      isSpecialCommParse(parsed) ||
      (isParityDelta(lastSolvedPieces) && isParityCommParse(parsed))
    ) &&
    shouldRecordCommParse(parsed, spanLength)
  );
}

function evaluateCommWindow({
  referenceTokens,
  currentState,
  startIndex,
  endIndex,
  buffers,
}) {
  const spanLength = endIndex - startIndex + 1;
  const baseTokens = stateToSlotTokens(currentState);
  const candidates = [{ rotation: "", tokens: baseTokens }];

  orientationRotationSequences.forEach((rotation) => {
    if (!rotation) {
      return;
    }
    candidates.push({
      rotation,
      tokens: rotateStateTokens(currentState, rotation),
    });
  });

  let fallback = null;
  for (const candidate of candidates) {
    const lastSolvedPieces = diffSolvedState(referenceTokens, candidate.tokens);
    const parsed = parseSolvedToComm(lastSolvedPieces, buffers);
    const result = {
      lastSolvedPieces,
      parsed,
      spanLength,
      implicitRotation: candidate.rotation || null,
      accepted: shouldAcceptCommSegment(lastSolvedPieces, parsed, spanLength),
    };

    if (!fallback) {
      fallback = result;
    }
    if (result.accepted) {
      return result;
    }
  }

  return fallback || {
    lastSolvedPieces: {},
    parsed: { comm: [], pieceType: { edge: false, corner: false, parity: false } },
    spanLength,
    implicitRotation: null,
    accepted: false,
  };
}

function applyMove(cube, moveToken) {
  cube.applyMove(new Move(normalizeMoveToken(moveToken)));
}

function cloneCubeState(state) {
  return {
    EDGES: {
      permutation: state.EDGES.permutation.slice(),
      orientation: state.EDGES.orientation.slice(),
    },
    CORNERS: {
      permutation: state.CORNERS.permutation.slice(),
      orientation: state.CORNERS.orientation.slice(),
    },
    CENTERS: {
      permutation: state.CENTERS.permutation.slice(),
      orientation: state.CENTERS.orientation.slice(),
    },
  };
}

function rotateStateTokens(state, rotationSequence) {
  const cube = new KPuzzle(cubeDefinition);
  cube.state = cloneCubeState(state);
  splitMoves(rotationSequence).forEach((move) => applyMove(cube, move));
  return stateToSlotTokens(cube.state);
}

function isSolvedState(state) {
  return countSolvedEdges(state) === 12 && countSolvedCorners(state) === 8;
}

function isSolvedModuloRotation(state) {
  if (isSolvedState(state)) {
    return true;
  }

  return orientationRotationSequences.some((rotation) => {
    if (!rotation) {
      return false;
    }

    const rotatedTokens = rotateStateTokens(state, rotation);
    const diff = diffSolvedState(stickerIdentityOrder, rotatedTokens);
    return Object.keys(diff).length === 0;
  });
}

export function buildLocalCommAnalysis(setting) {
  const orientation = setting.CUBE_OREINTATION || "yellow-green";
  const buffers = {
    edgeBuffer: setting.EDGES_BUFFER || "UF",
    cornerBuffer: setting.CORNER_BUFFER || "UFR",
  };
  const letterPairs = (() => {
    try {
      return JSON.parse(setting.LETTER_PAIRS_DICT || "{}");
    } catch (_error) {
      return {};
    }
  })();
  const parseToLetterPair = setting.PARSE_TO_LETTER_PAIR !== false;
  const { scrambleTokens, solveTokens, rotationPrefix } = normalizeForOrientation(
    setting.SCRAMBLE || "",
    setting.SOLVE || "",
    orientation
  );

  const cube = new KPuzzle(cubeDefinition);
  scrambleTokens.forEach((move) => applyMove(cube, move));

  let referenceTokens = stateToSlotTokens(cube.state);
  const prefixAlg = [];
  const comms = [];
  const solveStates = [];
  const stateSnapshotsAfterMove = [];
  const debugDeltas = [];
  let count = 0;

  while (count < solveTokens.length && rotationMoves.has(solveTokens[count])) {
    prefixAlg.push(solveTokens[count]);
    applyMove(cube, solveTokens[count]);
    referenceTokens = stateToSlotTokens(cube.state);
    count += 1;
  }

  const initialReferenceTokens = referenceTokens;
  const coreSolveTokens = solveTokens.slice(count);
  const stateTokensAfterMove = [];

  for (let index = 0; index < coreSolveTokens.length; index += 1) {
    const move = coreSolveTokens[index];
    applyMove(cube, move);
    const currentTokens = stateToSlotTokens(cube.state);
    stateSnapshotsAfterMove.push(cloneCubeState(cube.state));
    stateTokensAfterMove.push(currentTokens);

    solveStates.push({
      move,
      count: count + index + 1,
      solvedEdges: countSolvedEdges(cube.state),
      solvedCorners: countSolvedCorners(cube.state),
      diff: similarityRatio(index === 0 ? initialReferenceTokens : stateTokensAfterMove[index - 1], currentTokens),
    });
  }

  let cursor = 0;
  while (cursor < coreSolveTokens.length) {
    const startIndex = count + cursor + 1;
    const referenceAtCursor = cursor === 0 ? initialReferenceTokens : stateTokensAfterMove[cursor - 1];
    let acceptedSegment = null;
    let acceptedEnd = null;

    for (let end = cursor; end < coreSolveTokens.length; end += 1) {
      const candidateSegment = evaluateCommWindow({
        referenceTokens: referenceAtCursor,
        currentState: stateSnapshotsAfterMove[end],
        startIndex,
        endIndex: count + end + 1,
        buffers,
      });

      if (setting.DEBUG_COMM_DELTAS) {
        debugDeltas.push({
          count: count + end + 1,
          spanLength: candidateSegment.spanLength,
          changed: candidateSegment.lastSolvedPieces,
          parsed: candidateSegment.parsed,
          pieceSummary: changedPieceSummary(candidateSegment.lastSolvedPieces),
        });
      }

      if (candidateSegment.accepted) {
        acceptedSegment = candidateSegment;
        acceptedEnd = end;
      }
    }

    if (acceptedSegment && acceptedEnd !== null) {
      const algTokens = comms.length === 0 && prefixAlg.length
        ? prefixAlg.concat(coreSolveTokens.slice(cursor, acceptedEnd + 1))
        : coreSolveTokens.slice(cursor, acceptedEnd + 1);

      comms.push(
        buildCommStat({
          parsed: acceptedSegment.parsed,
          algTokens,
          moveStartIndex: comms.length === 0 && prefixAlg.length ? 1 : startIndex,
          moveEndIndex: count + acceptedEnd + 1,
          commIndex: comms.length + 1,
          parseToLetterPair,
          letterPairs,
          buffers,
          implicitRotation: acceptedSegment.implicitRotation,
        })
      );

      cursor = acceptedEnd + 1;
      continue;
    }

    appendUnknownCommStat(comms, {
      algTokens:
        comms.length === 0 && prefixAlg.length
          ? prefixAlg.concat([coreSolveTokens[cursor]])
          : [coreSolveTokens[cursor]],
      moveStartIndex: comms.length === 0 && prefixAlg.length ? 1 : startIndex,
      moveEndIndex: count + cursor + 1,
    });
    cursor += 1;
  }

  return {
    rotationPrefix,
    commStats: comms,
    parsed: comms.some((comm) => comm.phase !== "unknown"),
    solved: isSolvedModuloRotation(cube.state),
    solveStates,
    debugDeltas: setting.DEBUG_COMM_DELTAS ? debugDeltas : undefined,
  };
}
