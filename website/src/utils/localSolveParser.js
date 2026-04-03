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

const buildCubedbUrl = ({ scramble, solve, title, execTime }) => {
  const params = new URLSearchParams({
    puzzle: "3",
    title,
    scramble: scramble || "",
    time: String(execTime || 0),
    alg: solve || "",
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
  const timeOffsets = moveTimestamps.map((value) =>
    firstMoveTimestamp === null ? null : Number(((value - firstMoveTimestamp) / 1000).toFixed(2))
  );
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
  const moveTimeline = solveMoves.map((notation, index) => ({
    id: `local-move-${index + 1}`,
    index: index + 1,
    notation,
    time_offset: index < timeOffsets.length ? timeOffsets[index] : null,
  }));
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
    setting.SOLVE || "",
  ].join("\n");

  return {
    txt: localSummary,
    cubedb: buildCubedbUrl({
      scramble: setting.SCRAMBLE || "",
      solve: setting.SOLVE || "",
      title,
      execTime,
    }),
    local_only: true,
    fluidness,
    commStats: solveMoves.length
      ? [
          {
            comm_index: 1,
            phase: "unknown",
            piece_type: "unknown",
            buffer_target: null,
            target_a: null,
            target_b: null,
            special_type: "local-summary",
            alg: setting.SOLVE || "",
            alg_length: solveMoves.length,
          },
        ]
      : [],
    moveTimeline,
    solve: setting.SOLVE || "",
    stats: {
      totalMoves: solveMoves.length,
      timedMoves: moveTimestamps.length,
    },
  };
}
