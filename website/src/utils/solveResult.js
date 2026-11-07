import { isDnfValue } from "./solveAverages";

export function getSolveResult(solve) {
  return isDnfValue(solve && solve.DNF) ? "dnf" : Number(solve && solve.result_penalty) === 2 ? "plus2" : "ok";
}

export function applySolveResult(solve, result) {
  const storedBase = solve.unpenalized_time;
  const base = storedBase !== null && storedBase !== undefined && Number.isFinite(Number(storedBase))
    ? Number(storedBase)
    : Number(solve.time_solve) - (Number(solve.result_penalty) === 2 ? 2 : 0);
  const penalty = result === "plus2" ? 2 : 0;
  return {
    ...solve,
    unpenalized_time: base,
    result_penalty: penalty,
    time_solve: Number((base + penalty).toFixed(2)),
    DNF: result === "dnf",
    dnf_reason: result === "dnf" ? solve.dnf_reason || "" : "",
    updatedAt: Date.now(),
  };
}

export function parseDnfReason(reason = "") {
  const match = reason.match(/^(Wrong|Forgot)\s+(?:(Edge|Corner|Parity|Flip|Twist)\s+)?(Exec|Memo)$/i);
  return match ? {
    category: /^wrong$/i.test(match[1]) ? "Wrong Exec" : "Forgot Memo",
    stage: match[2] ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : "",
  } : { category: "", stage: "" };
}

export function formatDnfReason(category, stage) {
  if (category === "Wrong Exec") return stage ? `Wrong ${stage} Exec` : "Wrong Exec";
  if (category === "Forgot Memo") return stage ? `Forgot ${stage} Memo` : "Forgot Memo";
  return "";
}
