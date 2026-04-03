function getFiniteValues(solveStats, key) {
  return [...solveStats]
    .filter(({ DNF, [key]: value }) => DNF === false && Number.isFinite(parseFloat(value)))
    .map(({ [key]: value }) => parseFloat(value));
}

function averageValues(values) {
  if (!values.length) {
    return "";
  }

  const sum = values.reduce((previousValue, currentValue) => previousValue + currentValue, 0);
  return parseFloat((sum / values.length).toFixed(2));
}

export function computeSessionAggregateStats(solveStats, { calcMo3, calcAverage, formatSeconds }) {
  if (!Array.isArray(solveStats) || solveStats.length === 0) {
    return {
      current: "",
      mo3: "",
      ao5: "",
      ao12: "",
      aoAll: "",
      memo: "",
      exe: "",
      fluid: "",
      success: "",
    };
  }

  const len = solveStats.length;
  const latestSolve = solveStats[len - 1];
  const current =
    latestSolve && latestSolve.DNF === true
      ? `DNF(${formatSeconds(latestSolve.time_solve)})`
      : latestSolve
        ? latestSolve.time_solve
        : "";

  const successfulSolves = solveStats.filter(({ DNF }) => DNF === false);

  if (!successfulSolves.length) {
    return {
      current,
      mo3: solveStats.length >= 3 ? calcMo3(solveStats) : "",
      ao5: solveStats.length >= 5 ? calcAverage(solveStats.slice(len - 5, len)) : "",
      ao12: solveStats.length >= 12 ? calcAverage(solveStats.slice(len - 12, len)) : "",
      aoAll: "",
      memo: "",
      exe: "",
      fluid: "",
      success: `0/${solveStats.length}`,
    };
  }

  return {
    current,
    mo3: solveStats.length >= 3 ? calcMo3(solveStats) : "",
    ao5: solveStats.length >= 5 ? calcAverage(solveStats.slice(len - 5, len)) : "",
    ao12: solveStats.length >= 12 ? calcAverage(solveStats.slice(len - 12, len)) : "",
    aoAll: averageValues(getFiniteValues(solveStats, "time_solve")),
    memo: averageValues(getFiniteValues(solveStats, "memo_time")),
    exe: averageValues(getFiniteValues(solveStats, "exe_time")),
    fluid: averageValues(getFiniteValues(solveStats, "fluidness")),
    success: `${successfulSolves.length}/${solveStats.length}`,
  };
}

export { averageValues };
