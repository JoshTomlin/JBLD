import { expandCommNotation, hasCommNotation } from "./commNotation";

const HEADER_CASE_FIELDS = ["case", "case_code", "code", "target", "letter_pair"];
const HEADER_ALG_FIELDS = ["alg", "algorithm", "notation", "comm", "comm_notation"];

function normalizeCell(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function closeTrailingBracketGap(notation = "") {
  const value = String(notation || "").trim();
  const openCount = (value.match(/\[/g) || []).length;
  const closeCount = (value.match(/\]/g) || []).length;

  if (openCount <= closeCount) {
    return value;
  }

  return `${value}${"]".repeat(openCount - closeCount)}`;
}

function expandLibraryNotation(notation = "") {
  if (!hasCommNotation(notation)) {
    return notation;
  }

  try {
    return expandCommNotation(notation);
  } catch (error) {
    const repairedNotation = closeTrailingBracketGap(notation);
    if (repairedNotation !== notation) {
      return expandCommNotation(repairedNotation);
    }
    throw error;
  }
}

function parseCsvText(csvText = "") {
  const rows = [];
  let row = [];
  let value = "";
  let index = 0;
  let insideQuotes = false;

  while (index < csvText.length) {
    const char = csvText[index];

    if (insideQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        insideQuotes = false;
        index += 1;
        continue;
      }

      value += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      index += 1;
      continue;
    }

    if (char === "\r") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      index += 1;
      continue;
    }

    value += char;
    index += 1;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.map((currentRow) => currentRow.map(normalizeCell)).filter((currentRow) =>
    currentRow.some(Boolean)
  );
}

function detectHeaderRow(row = []) {
  const normalized = row.map((value) => normalizeCell(value).toLowerCase());
  return (
    normalized.some((value) => HEADER_CASE_FIELDS.includes(value)) &&
    normalized.some((value) => HEADER_ALG_FIELDS.includes(value))
  );
}

function resolveColumnIndex(headerRow, supportedFields, fallbackIndex) {
  const normalized = headerRow.map((value) => normalizeCell(value).toLowerCase());
  const matchIndex = normalized.findIndex((value) => supportedFields.includes(value));
  return matchIndex >= 0 ? matchIndex : fallbackIndex;
}

function buildEntry({ pieceType, sourceName, rowIndex, caseCode, notation }) {
  return {
    id: `${pieceType}-${caseCode}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
    pieceType,
    sheetName: sourceName,
    rowIndex,
    caseCode,
    notation,
    expandedAlg: expandLibraryNotation(notation),
  };
}

async function readFileText(file) {
  if (file && typeof file.text === "function") {
    return file.text();
  }

  if (typeof FileReader !== "undefined" && file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read CSV file"));
      reader.readAsText(file);
    });
  }

  throw new Error("This browser cannot read the selected CSV file.");
}

export function extractAlgLibraryEntriesFromCsv(csvText = "", pieceType = "unknown", sourceName = "") {
  const rows = parseCsvText(csvText);
  if (!rows.length) {
    return [];
  }

  const headerOffset = detectHeaderRow(rows[0]) ? 1 : 0;
  const headerRow = headerOffset ? rows[0] : [];
  const caseColumnIndex = headerOffset ? resolveColumnIndex(headerRow, HEADER_CASE_FIELDS, 0) : 0;
  const algColumnIndex = headerOffset ? resolveColumnIndex(headerRow, HEADER_ALG_FIELDS, 1) : 1;

  return rows
    .slice(headerOffset)
    .map((row, index) => {
      const caseCode = normalizeCell(row[caseColumnIndex]);
      const notation = normalizeCell(row[algColumnIndex]);

      if (!caseCode || !notation) {
        return null;
      }

      return buildEntry({
        pieceType,
        sourceName,
        rowIndex: index + 1 + headerOffset,
        caseCode,
        notation,
      });
    })
    .filter(Boolean);
}

export async function importAlgCsvFile(file, pieceType) {
  if (!pieceType) {
    throw new Error("Choose an alg category before importing a CSV file.");
  }

  const csvText = await readFileText(file);
  return extractAlgLibraryEntriesFromCsv(csvText, pieceType, file && file.name ? file.name : "CSV");
}
