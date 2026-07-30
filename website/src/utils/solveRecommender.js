import { Move } from "cubing/alg";
import { KPuzzle } from "cubing/kpuzzle";
import { experimentalCube3x3x3KPuzzle } from "cubing/puzzles";
import { normalizeForOrientation, toCanonicalStickerName } from "./localCommParser";

const cubeDefinition = experimentalCube3x3x3KPuzzle;
const reidEdgeOrder = "UF UR UB UL DF DR DB DL FR FL BR BL".split(" ");
const reidCornerOrder = "UFR URB UBL ULF DRF DFL DLB DBR".split(" ");
const centerOrder = "U L F R B D".split(" ");
const defaultCycleBreakLetters = ["B", "A", "D"];

function rotateLeft(value, amount) {
  if (!value) {
    return value;
  }

  const normalizedAmount = ((amount % value.length) + value.length) % value.length;
  return value.slice(normalizedAmount) + value.slice(0, normalizedAmount);
}

function normalizeMoveToken(move) {
  return String(move || "").replace(/â€™/g, "'");
}

function applyMove(cube, moveToken) {
  cube.applyMove(new Move(normalizeMoveToken(moveToken)));
}

function toReidStruct(state) {
  const output = [[], [], []];

  for (let index = 0; index < 12; index += 1) {
    output[0].push(
      rotateLeft(reidEdgeOrder[state.EDGES.permutation[index]], state.EDGES.orientation[index])
    );
  }

  for (let index = 0; index < 8; index += 1) {
    output[1].push(
      rotateLeft(reidCornerOrder[state.CORNERS.permutation[index]], state.CORNERS.orientation[index])
    );
  }

  output[2] = centerOrder.slice();
  return output;
}

export function buildSlotStickerMapFromState(state) {
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

function stickersForPiece(piece) {
  return Array.from({ length: piece.length }, (_, index) => rotateLeft(piece, index));
}

function isSamePiece(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  return a.split("").every((char) => b.includes(char));
}

function isSolvedForStickers(slotMap, stickers) {
  return stickers.every((sticker) => slotMap[sticker] === sticker);
}

function isPiecePermutationSolved(slotMap, piece) {
  return stickersForPiece(piece).every((sticker) =>
    isSamePiece(slotMap[sticker], sticker)
  );
}

function isOrientationOnlyPiece(slotMap, piece) {
  const stickers = stickersForPiece(piece);
  return (
    stickers.every((sticker) => isSamePiece(slotMap[sticker], sticker)) &&
    !isSolvedForStickers(slotMap, stickers)
  );
}

function parseLetterPairs(settings = {}) {
  try {
    return JSON.parse(settings.LETTER_PAIRS_DICT || "{}");
  } catch (_error) {
    return {};
  }
}

function stickerToLetter(sticker, letterPairs) {
  const canonicalSticker = toCanonicalStickerName(sticker);
  return letterPairs[canonicalSticker] || canonicalSticker;
}

function parseCycleBreakPreference(settings = {}) {
  const configured = settings.RECOMMENDED_CYCLE_BREAK_PRIORITY;
  if (Array.isArray(configured)) {
    return configured.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof configured === "string" && configured.trim()) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value).trim()).filter(Boolean);
      }
    } catch (_error) {
      return configured.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    }
  }

  return defaultCycleBreakLetters;
}

function facePreferenceScore(sticker) {
  if (!sticker) {
    return 90;
  }

  if (sticker[0] === "U") {
    return 10;
  }
  if (sticker[0] === "F" || sticker[0] === "B") {
    return 20;
  }
  if (sticker.includes("F") || sticker.includes("B")) {
    return 25;
  }
  if (sticker[0] === "D") {
    return 30;
  }
  if (sticker.includes("D")) {
    return 35;
  }

  return 40;
}

function scoreCycleBreakSticker(sticker, letterPairs, preferences, order) {
  const letter = stickerToLetter(sticker, letterPairs);
  const explicitIndex = preferences.findIndex(
    (value) => value.toUpperCase() === String(letter).toUpperCase()
  );
  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  const pieceIndex = order.findIndex((piece) => isSamePiece(piece, sticker));
  return 100 + facePreferenceScore(sticker) + (pieceIndex >= 0 ? pieceIndex / 100 : 1);
}

function getCycleBreakCandidates(
  slotMap,
  stickers,
  order,
  letterPairs,
  preferences,
  excludedPieces
) {
  const candidates = stickers
    .filter((sticker) => !excludedPieces.some((piece) => isSamePiece(sticker, piece)))
    .filter((sticker) => !isPiecePermutationSolved(slotMap, sticker));

  return candidates.sort((a, b) => {
    const scoreDiff =
      scoreCycleBreakSticker(a, letterPairs, preferences, order) -
      scoreCycleBreakSticker(b, letterPairs, preferences, order);
    return scoreDiff || String(a).localeCompare(String(b));
  });
}

function swapPiecesAtStickers(slotMap, a, b) {
  const next = { ...slotMap };
  const stickerCount = Math.min(a.length, b.length);

  for (let index = 0; index < stickerCount; index += 1) {
    const stickerA = rotateLeft(a, index);
    const stickerB = rotateLeft(b, index);
    const currentA = next[stickerA];
    next[stickerA] = next[stickerB];
    next[stickerB] = currentA;
  }

  return next;
}

function hasUnsolvedPieces(pieces, slotMap) {
  for (const piece of pieces) {
    if (!isPiecePermutationSolved(slotMap, piece)) {
      return true;
    }
  }
  return false;
}

function normalizeCycleBreakOverride(value) {
  if (value && typeof value === "object") {
    return String(value.sticker || value.letter || "").trim();
  }
  return String(value || "").trim();
}

function buildSlotMapSignature(stickers, slotMap) {
  return stickers.map((sticker) => slotMap[sticker] || "?").join("|");
}

function selectCycleBreakOverride(candidates, requestedOverride, letterPairs) {
  return (
    candidates.find((sticker) => sticker === requestedOverride) ||
    candidates.find(
      (sticker) =>
        requestedOverride &&
        String(stickerToLetter(sticker, letterPairs)).toUpperCase() === requestedOverride.toUpperCase()
    ) ||
    candidates[0]
  );
}

export function traceMemoTargetsFromSlotMap({
  slotMap,
  buffer,
  pieces,
  letterPairs = {},
  cycleBreakPreferences = defaultCycleBreakLetters,
  cycleBreakOverrides = [],
}) {
  const stickers = pieces.flatMap(stickersForPiece);
  let workingMap = { ...slotMap };
  const targets = [];
  const targetDetails = [];
  const cycleBreaks = [];
  const cycleBreakDetails = [];
  const seenStates = new Set();
  let guard = 0;

  while (hasUnsolvedPieces(pieces, workingMap) && guard < 200) {
    guard += 1;
    const stateSignature = buildSlotMapSignature(stickers, workingMap);
    if (seenStates.has(stateSignature)) {
      break;
    }
    seenStates.add(stateSignature);

    const bufferSticker = workingMap[buffer];
    const targetPieceIsSolved =
      bufferSticker && isPiecePermutationSolved(workingMap, bufferSticker);

    if (
      bufferSticker &&
      !isSamePiece(bufferSticker, buffer) &&
      !targetPieceIsSolved
    ) {
      const targetSticker = bufferSticker;
      const targetLetter = stickerToLetter(targetSticker, letterPairs);
      targets.push(targetLetter);
      targetDetails.push({
        letter: targetLetter,
        sticker: targetSticker,
        isCycleBreak: false,
        cycleBreakIndex: null,
        choices: [],
      });
      workingMap = swapPiecesAtStickers(workingMap, buffer, targetSticker);
      continue;
    }

    const candidates = getCycleBreakCandidates(
      workingMap,
      stickers,
      pieces,
      letterPairs,
      cycleBreakPreferences,
      [buffer]
    );
    const cycleBreakIndex = cycleBreakDetails.length;
    const requestedOverride = normalizeCycleBreakOverride(cycleBreakOverrides[cycleBreakIndex]);
    const cycleBreakSticker = selectCycleBreakOverride(
      candidates,
      requestedOverride,
      letterPairs
    );

    if (!cycleBreakSticker) {
      break;
    }

    const cycleBreakLetter = stickerToLetter(cycleBreakSticker, letterPairs);
    const choices = candidates.map((sticker) => ({
      sticker,
      letter: stickerToLetter(sticker, letterPairs),
    }));
    targets.push(cycleBreakLetter);
    targetDetails.push({
      letter: cycleBreakLetter,
      sticker: cycleBreakSticker,
      isCycleBreak: true,
      cycleBreakIndex,
      choices,
    });
    cycleBreaks.push(cycleBreakLetter);
    cycleBreakDetails.push({
      index: cycleBreakIndex,
      letter: cycleBreakLetter,
      sticker: cycleBreakSticker,
      choices,
    });
    workingMap = swapPiecesAtStickers(workingMap, buffer, cycleBreakSticker);
  }

  return {
    targets,
    targetDetails,
    cycleBreaks,
    cycleBreakDetails,
    solved: !hasUnsolvedPieces(pieces, workingMap),
    remainingSlotMap: workingMap,
  };
}

function pickEdgeFlipLabelSticker(piece) {
  const stickers = stickersForPiece(piece);
  return (
    stickers.find((sticker) => sticker[0] === "U" || sticker[0] === "D") ||
    stickers.find((sticker) => sticker[0] === "F" || sticker[0] === "B") ||
    piece
  );
}

function pickCornerTwistLabelSticker(piece) {
  return stickersForPiece(piece).find((sticker) => sticker[0] === "U" || sticker[0] === "D") || piece;
}

function pairTargets(targets) {
  const pairs = [];
  for (let index = 0; index < targets.length; index += 2) {
    pairs.push(targets.slice(index, index + 2).join(""));
  }
  return pairs;
}

function formatSpecialLabels(labels, suffix) {
  if (!labels.length) {
    return [];
  }

  const sorted = labels.slice().sort((a, b) => String(a).localeCompare(String(b)));
  const groups = [];
  for (let index = 0; index < sorted.length; index += 2) {
    groups.push(`${sorted.slice(index, index + 2).join("")} ${suffix}`.trim());
  }
  return groups;
}

function withoutOddParityTarget(targets) {
  return targets.length % 2 === 1 ? targets.slice(0, -1) : targets.slice();
}

function oddParityTarget(targets) {
  return targets.length % 2 === 1 ? targets[targets.length - 1] : null;
}

function buildPieceRecommendation({
  slotMap,
  pieces,
  buffer,
  letterPairs,
  cycleBreakPreferences,
  cycleBreakOverrides,
  type,
}) {
  const trace = traceMemoTargetsFromSlotMap({
    slotMap,
    buffer,
    pieces,
    letterPairs,
    cycleBreakPreferences,
    cycleBreakOverrides,
  });
  const orientationOnlyPieces = pieces.filter((piece) =>
    isOrientationOnlyPiece(trace.remainingSlotMap, piece)
  );

  const specialLabels = orientationOnlyPieces.map((piece) =>
    stickerToLetter(
      type === "edge" ? pickEdgeFlipLabelSticker(piece) : pickCornerTwistLabelSticker(piece),
      letterPairs
    )
  );

  return {
    ...trace,
    orientationOnlyPieces,
    specialLabels,
  };
}

export function buildRecommendedSolve(solveOrSetting = {}, maybeSettings = {}, options = {}) {
  const settings = {
    ...maybeSettings,
    ...solveOrSetting,
  };
  const scramble = solveOrSetting.scramble || settings.SCRAMBLE || "";
  const orientation = solveOrSetting.cube_orientation || settings.CUBE_OREINTATION || "yellow-green";
  const edgeBuffer = settings.EDGES_BUFFER || "UF";
  const cornerBuffer = settings.CORNER_BUFFER || "UFR";
  const letterPairs = parseLetterPairs(settings);
  const cycleBreakPreferences = parseCycleBreakPreference(settings);
  const cycleBreakOverrides = options.cycleBreakOverrides || {};
  const { scrambleTokens } = normalizeForOrientation(scramble, "", orientation);
  const cube = new KPuzzle(cubeDefinition);
  scrambleTokens.forEach((move) => applyMove(cube, move));
  const slotMap = buildSlotStickerMapFromState(cube.state);

  const edges = buildPieceRecommendation({
    slotMap,
    pieces: reidEdgeOrder,
    buffer: edgeBuffer,
    letterPairs,
    cycleBreakPreferences,
    cycleBreakOverrides: cycleBreakOverrides.edges || [],
    type: "edge",
  });
  const corners = buildPieceRecommendation({
    slotMap,
    pieces: reidCornerOrder,
    buffer: cornerBuffer,
    letterPairs,
    cycleBreakPreferences,
    cycleBreakOverrides: cycleBreakOverrides.corners || [],
    type: "corner",
  });

  const edgeParityTarget = oddParityTarget(edges.targets);
  const cornerParityTarget = oddParityTarget(corners.targets);
  const parityTarget = cornerParityTarget || edgeParityTarget;
  const hasParity = Boolean(edgeParityTarget || cornerParityTarget);
  const edgePairs = pairTargets(withoutOddParityTarget(edges.targets));
  const cornerPairs = pairTargets(withoutOddParityTarget(corners.targets));
  const edgePairTargets = [];
  const cornerPairTargets = [];
  const edgeTargetDetails = withoutOddParityTarget(edges.targetDetails);
  const cornerTargetDetails = withoutOddParityTarget(corners.targetDetails);
  for (let index = 0; index < edgeTargetDetails.length; index += 2) {
    edgePairTargets.push(edgeTargetDetails.slice(index, index + 2));
  }
  for (let index = 0; index < cornerTargetDetails.length; index += 2) {
    cornerPairTargets.push(cornerTargetDetails.slice(index, index + 2));
  }
  const flips = formatSpecialLabels(edges.specialLabels, "Flip");
  const twists = formatSpecialLabels(corners.specialLabels, "Twist");
  const notes = [];

  if (hasParity) {
    notes.push("Parity detected. Corner memo assumes the usual UF/UR pseudo-swap handling.");
  }
  if (hasParity && twists.length) {
    notes.push("Parity + twists: parity-shift from the parity target to the twist target's white/yellow face, then use top/bottom parity.");
  }
  if (edges.cycleBreaks.length || corners.cycleBreaks.length) {
    notes.push(
      `Cycle breaks: ${[
        edges.cycleBreaks.length ? `edges ${edges.cycleBreaks.join(", ")}` : "",
        corners.cycleBreaks.length ? `corners ${corners.cycleBreaks.join(", ")}` : "",
      ].filter(Boolean).join("; ")}.`
    );
  }

  return {
    scramble,
    edgeTargets: edges.targets,
    cornerTargets: corners.targets,
    edgePairs,
    cornerPairs,
    edgePairTargets,
    cornerPairTargets,
    flips,
    twists,
    parity: hasParity
      ? {
          target: parityTarget || "?",
          edgeTarget: edgeParityTarget,
          cornerTarget: cornerParityTarget,
          label: `${parityTarget || "?"} Parity`,
        }
      : null,
    cycleBreaks: {
      edges: edges.cycleBreaks,
      corners: corners.cycleBreaks,
    },
    cycleBreakDetails: {
      edges: edges.cycleBreakDetails,
      corners: corners.cycleBreakDetails,
    },
    solved: edges.solved && corners.solved,
    notes,
  };
}
