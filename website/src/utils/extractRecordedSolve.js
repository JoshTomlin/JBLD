export function extractRecordedSolveData({
  moves = [],
  moveTimes = [],
  timeStart = null,
  timeFinish = null,
}) {
  const safeMoves = Array.isArray(moves) ? moves : [];
  const safeMoveTimes = Array.isArray(moveTimes) ? moveTimes : [];
  const hasValidTimeStart = Number.isFinite(timeStart);
  const hasValidTimeFinish = Number.isFinite(timeFinish);
  const normalizedFinish = hasValidTimeFinish ? timeFinish : Number.POSITIVE_INFINITY;

  let firstSolveIndex = safeMoveTimes.findIndex(
    (timestamp) => hasValidTimeStart && Number.isFinite(timestamp) && timestamp >= timeStart
  );

  if (firstSolveIndex === -1) {
    firstSolveIndex = safeMoves.length;
  }

  const scramble = [];
  const solve = [];
  let memoTime = null;

  for (let index = 0; index < safeMoves.length; index += 1) {
    const move = safeMoves[index];
    const timestamp = safeMoveTimes[index];

    if (index < firstSolveIndex) {
      scramble.push(move);
      continue;
    }

    if (!Number.isFinite(timestamp) || timestamp <= normalizedFinish) {
      if (memoTime === null && Number.isFinite(timestamp) && hasValidTimeStart) {
        memoTime = Math.max((timestamp - timeStart) / 1000, 0);
      }
      solve.push(move);
    }
  }

  if (!solve.length && firstSolveIndex < safeMoves.length) {
    solve.push(...safeMoves.slice(firstSolveIndex));
  }

  const solveMoveTimes = safeMoveTimes
    .slice(firstSolveIndex, firstSolveIndex + solve.length)
    .filter((timestamp) => Number.isFinite(timestamp));
  const solveMoveOffsets = solveMoveTimes.length
    ? solveMoveTimes.map((timestamp, index) =>
        index === 0 ? 0 : Number(((timestamp - solveMoveTimes[0]) / 1000).toFixed(2))
      )
    : [];

  return {
    scramble,
    solve,
    memoTime: memoTime === null ? 0 : memoTime,
    solveMoveOffsets,
    firstSolveIndex,
  };
}
