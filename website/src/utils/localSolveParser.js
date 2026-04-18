import { buildLocalCommAnalysis } from "./localCommParser";

const splitMoves = (algText = "") =>
  algText
    .trim()
    .split(/\s+/)
    .map((move) => move.trim())
    .filter(Boolean);

const normalizeTimeArray = (rawTimes) => {
  if (!Array.isArray(rawTimes)) {
    return [];
  }

  return rawTimes
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
};

const buildSolveTitle = ({ dateSolve, totalText, memoText, execText, fluidness, isDnf }) => {
  const parts = [];
  const timeBlock = `${totalText}(${memoText},${execText})`;
  parts.push(isDnf ? `DNF(${timeBlock})` : timeBlock);

  if (fluidness !== null && fluidness !== undefined) {
    parts.push(`${fluidness}%`);
  }

  if (dateSolve) {
    parts.push(dateSolve);
  }

  return parts.join(" ");
};

const rotationMaps = {
  x: { U: "F", F: "D", D: "B", B: "U", E: "S'", S: "E" },
  y: { R: "B", B: "L", L: "F", F: "R", M: "S", S: "M'" },
  z: { R: "U", U: "L", L: "D", D: "R", M: "E", E: "M'" },
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

function translateMoves(tokens, mapping) {
  return tokens.map((token) => {
    const match = token.match(/^([A-Za-z]+)(2|')?$/);
    if (!match) {
      return token;
    }

    const mapped = mapping[match[1]];
    return mapped ? `${mapped}${match[2] || ""}`.replace(/''/g, "") : token;
  });
}

function applyRotation(tokens, rotation) {
  const baseRotation = rotation && rotation[0];
  if (!baseRotation || !rotationMaps[baseRotation]) {
    return tokens.slice();
  }

  let next = tokens.slice();
  const amount = rotation.endsWith("2") ? 2 : rotation.endsWith("'") ? 3 : 1;
  for (let index = 0; index < amount; index += 1) {
    next = translateMoves(next, rotationMaps[baseRotation]);
  }
  return next;
}

function orientSolveForCubedb(solve, rotationPrefix) {
  const rotations = splitMoves(rotationPrefix || "");
  const solveTokens = splitMoves(solve || "");
  if (!rotations.length || !solveTokens.length) {
    return solve || "";
  }

  const transformedSolve = rotations
    .map((rotation) => inverseRotationMap[rotation] || rotation)
    .reverse()
    .reduce((tokens, rotation) => applyRotation(tokens, rotation), solveTokens);

  return `${rotations.join(" ")}\n${transformedSolve.join(" ")}`;
}

export const buildCubedbUrl = ({ scramble, solve, title, execTime, rotationPrefix }) => {
  const algorithm = orientSolveForCubedb(solve || "", rotationPrefix);
  const params = new URLSearchParams({
    puzzle: "3",
    title,
    scramble: scramble || "",
    time: String(execTime || 0),
    alg: algorithm,
  });

  return `https://www.cubedb.net/?${params.toString()}`;
};

export function buildLocalSolveResult(setting, formatSeconds) {
  const totalTime = Number(setting.TIME_SOLVE || 0);
  const memoTime = Number(setting.MEMO || 0);
  const execTime = Math.max(totalTime - memoTime, 0);
  const totalText = formatSeconds(totalTime);
  const memoText = formatSeconds(memoTime);
  const execText = formatSeconds(execTime);
  const solveMoves = splitMoves(setting.SOLVE || "");
  const moveTimestamps = normalizeTimeArray(setting.SOLVE_TIME_MOVES);
  const firstMoveTimestamp = moveTimestamps.length ? moveTimestamps[0] : null;
  const moveTimesAreTimestamps =
    firstMoveTimestamp !== null && Math.abs(firstMoveTimestamp) > 1000000;
  const timeOffsets = moveTimestamps.map((value) => {
    if (firstMoveTimestamp === null) {
      return null;
    }

    return moveTimesAreTimestamps
      ? Number(((value - firstMoveTimestamp) / 1000).toFixed(2))
      : Number((value - firstMoveTimestamp).toFixed(2));
  });
  const fluidness =
    execTime > 0 && timeOffsets.length
      ? Number(
          (
            ((timeOffsets[timeOffsets.length - 1] || 0) / execTime) *
            100
          ).toFixed(2)
        )
      : null;
  const title = buildSolveTitle({
    dateSolve: setting.DATE_SOLVE,
    totalText,
    memoText,
    execText,
    fluidness,
    isDnf: false,
  });
  const commAnalysis = buildLocalCommAnalysis(setting);
  const moveTimeline = solveMoves.map((notation, index) => {
    const comm = commAnalysis.commStats.find(
      (entry) => index + 1 >= entry.move_start_index && index + 1 <= entry.move_end_index
    );

    return {
      id: `local-move-${index + 1}`,
      index: index + 1,
      notation,
      comm_index: comm ? comm.comm_index : null,
      phase: comm ? comm.phase : "unknown",
      time_offset: index < timeOffsets.length ? timeOffsets[index] : null,
    };
  });
  let previousEndIndex = 0;
  const commStats = commAnalysis.commStats.map((comm) => {
    const startIndex = Number(comm.move_start_index);
    const endIndex = Number(comm.move_end_index);
    const startOffset = Number.isFinite(startIndex) ? timeOffsets[startIndex - 1] : null;
    const endOffset = Number.isFinite(endIndex) ? timeOffsets[endIndex - 1] : null;
    const previousEndOffset =
      previousEndIndex > 0 ? timeOffsets[previousEndIndex - 1] : 0;
    const recogTime =
      Number.isFinite(startOffset) && Number.isFinite(previousEndOffset)
        ? Math.max(startOffset - previousEndOffset, 0)
        : null;
    const execTimeForComm =
      Number.isFinite(startOffset) && Number.isFinite(endOffset)
        ? Math.max(endOffset - startOffset, 0)
        : null;

    if (Number.isFinite(endIndex)) {
      previousEndIndex = endIndex;
    }

    return {
      ...comm,
      recog_time: recogTime,
      exec_time: execTimeForComm,
    };
  });
  const localSummary = [
    `${title}`,
    "",
    "Scramble:",
    setting.SCRAMBLE || "",
    "",
    "//local pwa analysis",
    `// Move count ${solveMoves.length}`,
    moveTimestamps.length ? `// Timed moves ${moveTimestamps.length}` : "// Timed moves unavailable",
    "",
    "Solve:",
    ...(commAnalysis.rotationPrefix ? [`${commAnalysis.rotationPrefix} // memo`] : []),
    ...(commStats.length
      ? commStats.map(
          (comm) => `${comm.alg} // ${comm.parse_text || comm.phase}`
        )
      : [setting.SOLVE || ""]),
  ].join("\n");

  return {
    txt: localSummary,
    cubedb: buildCubedbUrl({
      scramble: setting.SCRAMBLE || "",
      solve: setting.SOLVE || "",
      title,
      execTime,
      rotationPrefix: commAnalysis.rotationPrefix,
    }),
    local_only: true,
    success: commAnalysis.solved,
    DNF: !commAnalysis.solved,
    fluidness,
    commStats,
    moveTimeline,
    solve: setting.SOLVE || "",
    stats: {
      totalMoves: solveMoves.length,
      timedMoves: moveTimestamps.length,
      totalComms: commAnalysis.commStats.length,
    },
  };
}
