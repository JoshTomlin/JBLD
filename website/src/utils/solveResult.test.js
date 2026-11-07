import { applySolveResult, getSolveResult, parseDnfReason, formatDnfReason } from "./solveResult";

const solve = { time_solve: 42.83, memo_time: 17.1, exe_time: 25.73, DNF: false };

test("a +2 is reversible and does not compound or change recorded splits", () => {
  const penalized = applySolveResult(solve, "plus2");
  expect(penalized.time_solve).toBe(44.83);
  expect(penalized.exe_time).toBe(25.73);
  expect(penalized.memo_time).toBe(17.1);
  expect(applySolveResult(penalized, "plus2").time_solve).toBe(44.83);
  expect(applySolveResult(penalized, "ok").time_solve).toBe(42.83);
  expect(getSolveResult(penalized)).toBe("plus2");
});

test("a DNF needs no reason and can be explicitly corrected", () => {
  const failed = applySolveResult(solve, "dnf");
  expect(failed.DNF).toBe(true);
  expect(failed.dnf_reason).toBe("");
  expect(getSolveResult(failed)).toBe("dnf");
  expect(applySolveResult({ ...failed, dnf_reason: "Forgot Edge Memo" }, "ok").dnf_reason).toBe("");
});

test("changing between DNF, +2 and OK always uses the original time", () => {
  const failed = applySolveResult(applySolveResult(solve, "plus2"), "dnf");
  expect(failed.time_solve).toBe(42.83);
  const penalized = applySolveResult(failed, "plus2");
  expect(penalized.time_solve).toBe(44.83);
  expect(penalized.DNF).toBe(false);
});

test("a restored penalty without a stored base can still be removed", () => {
  expect(applySolveResult({ ...solve, result_penalty: 2, time_solve: 44.83 }, "ok").time_solve).toBe(42.83);
});

test("reason and stage round-trip independently of result status", () => {
  expect(parseDnfReason("Wrong Corner Exec")).toEqual({ category: "Wrong Exec", stage: "Corner" });
  expect(parseDnfReason("Forgot Memo")).toEqual({ category: "Forgot Memo", stage: "" });
  expect(formatDnfReason("Forgot Memo", "Edge")).toBe("Forgot Edge Memo");
  expect(formatDnfReason("", "Corner")).toBe("");
});
