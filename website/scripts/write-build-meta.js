"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const websiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(websiteRoot, "..");
const outputPath = path.join(websiteRoot, "src", "buildMeta.js");

function readGitValue(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_error) {
    return "";
  }
}

function formatCommitDate(isoValue) {
  if (!isoValue) {
    return "Unknown";
  }

  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return isoValue;
  }

  const formatter = new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Adelaide",
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const commitHash = readGitValue("rev-parse HEAD");
const commitDateIso = readGitValue("log -1 --date=iso-strict-local --format=%cd");
const commitDateLabel = formatCommitDate(commitDateIso);

const contents = [
  `export const APP_LAST_UPDATED_LABEL = ${JSON.stringify(commitDateLabel)};`,
  `export const APP_LAST_COMMIT_HASH = ${JSON.stringify(commitHash || "unknown")};`,
  `export const APP_LAST_COMMIT_DATE_ISO = ${JSON.stringify(commitDateIso || "")};`,
  "",
].join("\n");

fs.writeFileSync(outputPath, contents, "utf8");
console.log(`[build-meta] wrote ${path.relative(websiteRoot, outputPath)} (${commitDateLabel})`);
