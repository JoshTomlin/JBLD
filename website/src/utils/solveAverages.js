function isDnfValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function getFiniteValues(solveStats, key) {
  return [...solveStats]
    .filter(({ DNF, [key]: value }) => !isDnfValue(DNF) && Number.isFinite(parseFloat(value)))
    .map(({ [key]: value }) => parseFloat(value));
}

function averageValues(values) {
  if (!values.length) {
    return "";
  }

  const sum = values.reduce((previousValue, currentValue) => previousValue + currentValue, 0);
  return parseFloat((sum / values.length).toFixed(2));
}

export function calculateTrimmedAverage(solves) {
  if (solves.length < 3) {
    return "";
  }

  const times = solves.map((solve) => {
    const time = parseFloat(solve.time_solve);
    return isDnfValue(solve.DNF) || !Number.isFinite(time) ? Infinity : time;
  }).sort((left, right) => left - right);
  // Trim 5% at each end, rounded up: one for Ao5/Ao12, three for Ao50.
  const trimCount = Math.ceil(times.length * 0.05);
  const remaining = times.slice(trimCount, times.length - trimCount);
  return remaining.some((time) => !Number.isFinite(time)) ? "DNF" : averageValues(remaining);
}

export function calculateMeanOfThree(solves) {
  if (solves.length < 3) {
    return "";
  }
  const lastThree = solves.slice(-3);
  if (lastThree.some((solve) => isDnfValue(solve.DNF) || !Number.isFinite(parseFloat(solve.time_solve)))) {
    return "DNF";
  }
  return averageValues(lastThree.map((solve) => parseFloat(solve.time_solve)));
}

export function computeSessionAggregateStats(solveStats, {
  calcMo3 = calculateMeanOfThree,
  calcAverage = calculateTrimmedAverage,
  formatSeconds = String,
} = {}) {
  if (!Array.isArray(solveStats) || solveStats.length === 0) {
    return {
      current: "",
      mo3: "",
      ao5: "",
      ao12: "",
      ao50: "",
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
    latestSolve && isDnfValue(latestSolve.DNF)
      ? `DNF(${formatSeconds(latestSolve.time_solve)})`
      : latestSolve
        ? latestSolve.time_solve
        : "";

  const successfulSolves = solveStats.filter(({ DNF }) => !isDnfValue(DNF));

  return {
    current,
    mo3: solveStats.length >= 3 ? calcMo3(solveStats) : "",
    ao5: solveStats.length >= 5 ? calcAverage(solveStats.slice(len - 5, len)) : "",
    ao12: solveStats.length >= 12 ? calcAverage(solveStats.slice(len - 12, len)) : "",
    ao50: solveStats.length >= 50 ? calcAverage(solveStats.slice(len - 50, len)) : "",
    aoAll: averageValues(getFiniteValues(solveStats, "time_solve")),
    memo: averageValues(getFiniteValues(solveStats, "memo_time")),
    exe: averageValues(getFiniteValues(solveStats, "exe_time")),
    fluid: averageValues(getFiniteValues(solveStats, "fluidness")),
    success: `${successfulSolves.length}/${solveStats.length}`,
  };
}

export function computeSessionBestStats(solves = []) {
  const result = {
    best: { time: 10000, num: 0, solve: {} },
    bmo3: { time: 10000, num: 0, solves: [] },
    bao5: { time: 10000, num: 0, solves: [] },
    bao12: { time: 10000, num: 0, solves: [] },
  };

  solves.forEach((solve, index) => {
    const time = parseFloat(solve.time_solve);
    if (!isDnfValue(solve.DNF) && Number.isFinite(time) && time < result.best.time) {
      result.best = { time, num: index, solve };
    }
    [["bmo3", 3], ["bao5", 5], ["bao12", 12]].forEach(([key, size]) => {
      if (index + 1 < size) {
        return;
      }
      const window = solves.slice(index + 1 - size, index + 1);
      const average = size === 3 ? calculateMeanOfThree(window) : calculateTrimmedAverage(window);
      if (typeof average === "number" && average < result[key].time) {
        result[key] = { time: average, num: index + 1 - size, solves: window };
      }
    });
  });

  return result;
}

export { averageValues, isDnfValue };
