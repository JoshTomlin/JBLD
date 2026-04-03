import { Alg } from "cubing/alg";
import { countMoves } from "cubing/notation";

const letterPairs = {
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
};

const descriptionWords = new Set(["corners", "edges", "parity"]);
const edgeStickers = new Set(Object.keys(letterPairs).filter((key) => key.length === 2));
const cornerStickers = new Set(Object.keys(letterPairs).filter((key) => key.length === 3));

function fixUD(alg) {
  return alg
    .split(" ")
    .map((token) => {
      if (token.includes("U") && token.includes("D")) {
        const d = token.indexOf("D");
        const u = token.indexOf("U");
        if (u > d) {
          return `${token.slice(0, u)} ${token.slice(u)}`;
        }
        return `${token.slice(0, d)} ${token.slice(d)}`;
      }
      return token;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandRepeatedGroups(alg) {
  let next = alg;
  let previous = null;

  while (next !== previous) {
    previous = next;
    next = next.replace(/\(([^()]+)\)([2-4])/g, (_, inner, reps) =>
      Array.from({ length: Number(reps) }, () => inner.trim()).join(" ")
    );
  }

  return next;
}

function splitComment(line) {
  const commentIndex = line.indexOf("//");
  if (commentIndex === -1) {
    return { body: line.trim(), comment: "" };
  }

  return {
    body: line.slice(0, commentIndex).trim(),
    comment: line.slice(commentIndex + 2).trim(),
  };
}

function normalizeAlgorithmText(rawAlg) {
  if (!rawAlg || !rawAlg.trim()) return "";

  const cleaned = expandRepeatedGroups(
    rawAlg
      .replace(/[\s\u00A0]+/g, " ")
      .trim()
  );

  try {
    return new Alg(cleaned).expand().simplify().toString();
  } catch (_error) {
    const fallback = fixUD(cleaned);
    try {
      return new Alg(fallback).expand().simplify().toString();
    } catch (_fallbackError) {
      return cleaned;
    }
  }
}

function checkSlice(m1, m2) {
  const sliceMap = {
    "U' D": "E' y'",
    "D U'": "E' y'",
    "U D'": "E y",
    "D' U": "E y",
    "R L'": "M x",
    "L' R": "M x",
    "R' L": "M' x'",
    "L R'": "M' x'",
    "F B'": "S' z",
    "B' F": "S' z",
    "F' B": "S z'",
    "B F'": "S z'",
  };
  return sliceMap[`${m1} ${m2}`] || null;
}

function parseRotationAndSlice(algStr) {
  const normalized = normalizeAlgorithmText(algStr);
  if (!normalized) {
    return "";
  }

  const moves = normalized.split(" ").filter(Boolean);
  const result = [];

  for (let i = 0; i < moves.length; i += 1) {
    if (i + 1 < moves.length) {
      const maybeSlice = checkSlice(moves[i], moves[i + 1]);
      if (maybeSlice) {
        result.push(...maybeSlice.split(" "));
        i += 1;
        continue;
      }
    }
    result.push(moves[i]);
  }

  return normalizeAlgorithmText(result.join(" "));
}

function mapStickerToLetter(sticker) {
  if (!sticker || !sticker.trim()) return null;
  return letterPairs[sticker.toUpperCase()] ?? null;
}

function extractSolveSection(solveText) {
  const rawLines = solveText.split(/\r?\n/);
  const solveIndex = rawLines.findIndex((line) => line.trim().toLowerCase() === "solve:");
  return solveIndex >= 0 ? rawLines.slice(solveIndex + 1) : rawLines;
}

function normalizePhase(phase) {
  if (!phase) {
    return "unknown";
  }

  const lower = phase.toLowerCase();
  if (lower === "edges" || lower === "edge") {
    return "edge";
  }
  if (lower === "corners" || lower === "corner") {
    return "corner";
  }
  if (lower === "parity") {
    return "parity";
  }
  return "unknown";
}

function splitCompactToken(token) {
  if (!token) {
    return [];
  }

  const normalized = token.trim().toUpperCase();
  if (!normalized) {
    return [];
  }

  if (edgeStickers.has(normalized) || cornerStickers.has(normalized)) {
    return [normalized];
  }

  if (/^[A-Z]{2}$/.test(normalized) && !edgeStickers.has(normalized)) {
    return normalized.split("");
  }

  if (normalized.length === 4) {
    const first = normalized.slice(0, 2);
    const second = normalized.slice(2, 4);
    if (edgeStickers.has(first) && edgeStickers.has(second)) {
      return [first, second];
    }
  }

  if (normalized.length === 6) {
    const first = normalized.slice(0, 3);
    const second = normalized.slice(3, 6);
    if (cornerStickers.has(first) && cornerStickers.has(second)) {
      return [first, second];
    }
  }

  return [normalized];
}

function parseTargetsFromComment(comment) {
  if (!comment) {
    return {
      bufferTarget: null,
      targetA: null,
      targetB: null,
      specialType: null,
      display: "",
    };
  }

  const cleaned = comment
    .replace(/\b\d+\/\d+\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?s?\b/g, " ")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lower = cleaned.toLowerCase();
  const specialType = lower.includes("flip")
    ? "flip"
    : lower.includes("twist")
      ? "twist"
      : null;

  if (lower.includes("parity")) {
    return {
      bufferTarget: null,
      targetA: null,
      targetB: null,
      specialType,
      display: "parity",
    };
  }

  const pieces = cleaned
    .split(/[\s:/>|-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .flatMap(splitCompactToken)
    .filter((token) => !/^(FLIP|TWIST|PARITY)$/i.test(token));

  return {
    bufferTarget: pieces.length >= 3 ? pieces[0] : null,
    targetA: pieces.length >= 3 ? pieces[1] : pieces[0] || null,
    targetB: pieces.length >= 3 ? pieces[2] : pieces[1] || null,
    specialType,
    display: cleaned,
  };
}

function inferPhase(explicitPhase, targets) {
  const normalizedExplicit = normalizePhase(explicitPhase);
  if (normalizedExplicit !== "unknown") {
    return normalizedExplicit;
  }

  if (targets.specialType === "flip") {
    return "edge";
  }
  if (targets.specialType === "twist") {
    return "corner";
  }
  if (targets.display.toLowerCase() === "parity") {
    return "parity";
  }
  if (targets.targetA && edgeStickers.has(targets.targetA)) {
    return "edge";
  }
  if (targets.targetA && cornerStickers.has(targets.targetA)) {
    return "corner";
  }
  return "unknown";
}

function countAlgorithmMoves(algText) {
  if (!algText) {
    return 0;
  }

  try {
    return countMoves(new Alg(algText));
  } catch (_error) {
    return algText.split(/\s+/).filter(Boolean).length;
  }
}

function buildMoveTimeline(parsedComms) {
  const timeline = [];

  parsedComms.forEach((comm, commIndex) => {
    const moves = comm.simplified.split(/\s+/).filter(Boolean);
    moves.forEach((move, moveIndex) => {
      timeline.push({
        move_index: timeline.length + 1,
        comm_index: commIndex + 1,
        phase: comm.phase,
        move,
        move_in_comm: moveIndex + 1,
      });
    });
  });

  return timeline;
}

export function parseSolve(solveText, options = {}) {
  const { parseToLetterPairs = true } = options;
  const rawLines = extractSolveSection(solveText);
  const parsedComms = [];
  let currentPhase = "unknown";

  rawLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const normalizedHeader = trimmed.toLowerCase();
    if (descriptionWords.has(normalizedHeader)) {
      currentPhase = normalizedHeader;
      return;
    }

    if (trimmed.toLowerCase() === "scramble:") {
      return;
    }

    if (trimmed.startsWith("//")) {
      return;
    }

    const { body, comment } = splitComment(trimmed);
    if (!body) {
      return;
    }
    if (comment.toLowerCase() === "memo") {
      return;
    }

    const algorithm = parseRotationAndSlice(body);
    const simplified = normalizeAlgorithmText(algorithm);
    const targets = parseTargetsFromComment(comment);
    const phase = inferPhase(currentPhase, targets);
    const moveCount = countAlgorithmMoves(simplified);

    parsedComms.push({
      comm_index: parsedComms.length + 1,
      raw: body,
      comment,
      phase,
      piece_type: phase,
      buffer_target: targets.bufferTarget,
      target_a: targets.targetA,
      target_b: targets.targetB,
      special_type: targets.specialType,
      algorithm,
      simplified,
      alg: simplified,
      alg_length: moveCount,
      moveCount,
      letterPairs: parseToLetterPairs
        ? [targets.bufferTarget, targets.targetA, targets.targetB]
            .filter(Boolean)
            .map((piece) => ({ piece, letter: mapStickerToLetter(piece) }))
            .filter((entry) => entry.letter)
        : [],
    });
  });

  const finalSolve = parsedComms.map((comm) => comm.simplified).join(" ").trim();
  const moveTimeline = buildMoveTimeline(parsedComms);

  return {
    rawSolve: solveText,
    parsedComms,
    commStats: parsedComms.map((comm) => ({
      comm_index: comm.comm_index,
      phase: comm.phase,
      piece_type: comm.piece_type,
      buffer_target: comm.buffer_target,
      target_a: comm.target_a,
      target_b: comm.target_b,
      special_type: comm.special_type,
      alg: comm.alg,
      alg_length: comm.alg_length,
    })),
    moveTimeline,
    solve: finalSolve,
    commCount: parsedComms.length,
  };
}

export function collapseMoves(algText) {
  if (!algText || !algText.trim()) return "";
  return new Alg(algText).simplify().toString();
}

export function toCanonicalAlg(algText) {
  if (!algText || !algText.trim()) return "";
  return normalizeAlgorithmText(algText);
}

export function formatSolveData(solveResult) {
  const byType = {
    edges: [],
    corners: [],
    parity: [],
    unknown: [],
  };

  for (const comm of solveResult.parsedComms) {
    if (comm.phase === "edge") {
      byType.edges.push(comm);
    } else if (comm.phase === "corner") {
      byType.corners.push(comm);
    } else if (comm.phase === "parity") {
      byType.parity.push(comm);
    } else {
      byType.unknown.push(comm);
    }
  }

  return {
    ...solveResult,
    stats: {
      totalMoves: solveResult.parsedComms.reduce((sum, comm) => sum + comm.moveCount, 0),
      totalComms: solveResult.commCount,
      edges: byType.edges.length,
      corners: byType.corners.length,
      parity: byType.parity.length,
      unknown: byType.unknown.length,
    },
    commsByType: byType,
  };
}

export function buildSolveAnalysis(solveText, options = {}) {
  const parsed = parseSolve(solveText, options);
  return formatSolveData(parsed);
}
