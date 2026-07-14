import { expandCommNotation, hasCommNotation } from "./commNotation";

const HEADER_CASE_FIELDS = ["case", "case_code", "code", "target", "letter_pair", "pair"];
const HEADER_DESCRIPTION_FIELDS = [
  "description",
  "desc",
  "notation",
  "comm",
  "comm_notation",
  "comm notation",
];
const HEADER_ALG_FIELDS = ["alg", "algorithm", "expanded_alg", "expanded alg", "expanded algorithm"];
const HEADER_MEMO_FIELDS = ["memo", "memo_word", "memo word", "word"];
const HEADER_CATEGORY_FIELDS = ["category", "group", "set"];
const HEADER_NOTES_FIELDS = ["notes", "note", "comment", "comments"];
const HEADER_LAST_SEEN_FIELDS = ["last_seen", "last_seen_at", "last seen", "last seen at", "seen"];

function normalizeCell(value) {
  return value === null || value === undefined ? "" : String(value).replace(/^\uFEFF/, "").trim();
}

function repairBracketBalance(notation = "") {
  const value = String(notation || "").trim();
  const openCount = (value.match(/\[/g) || []).length;
  const closeCount = (value.match(/\]/g) || []).length;

  if (openCount === closeCount) {
    return value;
  }

  if (openCount > closeCount) {
    return `${value}${"]".repeat(openCount - closeCount)}`;
  }

  let repairedValue = value;
  let extraClosers = closeCount - openCount;
  while (extraClosers > 0 && repairedValue.endsWith("]")) {
    repairedValue = repairedValue.slice(0, -1).trimEnd();
    extraClosers -= 1;
  }

  return repairedValue;
}

function expandGroupedRepeats(notation = "") {
  let expandedNotation = normalizeCell(notation);
  let previousNotation = null;
  const groupPattern = /\(([^()]+)\)(\d+)/g;

  while (expandedNotation !== previousNotation) {
    previousNotation = expandedNotation;
    expandedNotation = expandedNotation
      .replace(groupPattern, (_match, inner, repeatCount) => {
        const count = Number(repeatCount);
        if (!Number.isInteger(count) || count < 1) {
          return `(${inner})${repeatCount}`;
        }

        return Array.from({ length: count }, () => normalizeCell(inner)).join(" ");
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  return expandedNotation;
}

function expandLibraryNotation(notation = "") {
  const normalizedNotation = normalizeCell(notation);
  if (!normalizedNotation) {
    return "";
  }

  const expandedGroupedNotation = /[()]/.test(normalizedNotation)
    ? expandGroupedRepeats(normalizedNotation)
    : normalizedNotation;

  if (!hasCommNotation(expandedGroupedNotation)) {
    return expandedGroupedNotation;
  }

  try {
    return expandCommNotation(expandedGroupedNotation);
  } catch (error) {
    const repairedNotation = repairBracketBalance(expandedGroupedNotation);
    if (repairedNotation !== expandedGroupedNotation) {
      return expandCommNotation(repairedNotation);
    }
    throw error;
  }
}

function normalizeExpandedAlg(alg = "", fallbackNotation = "") {
  const normalizedAlg = normalizeCell(alg);
  if (normalizedAlg) {
    return expandLibraryNotation(normalizedAlg);
  }

  return expandLibraryNotation(fallbackNotation);
}

function normalizeDateCell(value) {
  const normalizedValue = normalizeCell(value);
  if (!normalizedValue) {
    return null;
  }

  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    (
      normalized.some((value) => HEADER_DESCRIPTION_FIELDS.includes(value)) ||
      normalized.some((value) => HEADER_ALG_FIELDS.includes(value))
    )
  );
}

function resolveColumnIndex(headerRow, supportedFields, fallbackIndex) {
  const normalized = headerRow.map((value) => normalizeCell(value).toLowerCase());
  const matchIndex = normalized.findIndex((value) => supportedFields.includes(value));
  return matchIndex >= 0 ? matchIndex : fallbackIndex;
}

function resolveOptionalColumnIndex(headerRow, supportedFields) {
  return resolveColumnIndex(headerRow, supportedFields, -1);
}

function buildEntry({
  pieceType,
  sourceName,
  rowIndex,
  caseCode,
  description,
  alg,
  memoWord,
  category,
  notes,
  lastSeenAt,
}) {
  const normalizedDescription = normalizeCell(description);
  const normalizedAlg = normalizeExpandedAlg(alg, normalizedDescription);

  return {
    id: `${pieceType}-${caseCode}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
    pieceType,
    sheetName: sourceName,
    rowIndex,
    caseCode,
    notation: normalizedDescription,
    expandedAlg: normalizedAlg,
    description: normalizedDescription,
    alg: normalizedAlg,
    memoWord: normalizeCell(memoWord) || null,
    category: normalizeCell(category) || null,
    notes: normalizeCell(notes) || null,
    lastSeenAt: normalizeDateCell(lastSeenAt),
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
  const descriptionColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_DESCRIPTION_FIELDS) : 1;
  const algColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_ALG_FIELDS) : -1;
  const memoColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_MEMO_FIELDS) : -1;
  const categoryColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_CATEGORY_FIELDS) : -1;
  const notesColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_NOTES_FIELDS) : -1;
  const lastSeenColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_LAST_SEEN_FIELDS) : -1;

  return rows
    .slice(headerOffset)
    .map((row, index) => {
      const caseCode = normalizeCell(row[caseColumnIndex]);
      const description =
        normalizeCell(row[descriptionColumnIndex]) ||
        normalizeCell(row[algColumnIndex >= 0 ? algColumnIndex : 1]);
      const hasDedicatedAlgColumn = descriptionColumnIndex >= 0 && algColumnIndex >= 0;
      const alg = hasDedicatedAlgColumn ? normalizeCell(row[algColumnIndex]) : "";
      const memoWord = memoColumnIndex >= 0 ? normalizeCell(row[memoColumnIndex]) : "";
      const category = categoryColumnIndex >= 0 ? normalizeCell(row[categoryColumnIndex]) : "";
      const notes = notesColumnIndex >= 0 ? normalizeCell(row[notesColumnIndex]) : "";
      const lastSeenAt = lastSeenColumnIndex >= 0 ? row[lastSeenColumnIndex] : "";

      if (!caseCode || !description) {
        return null;
      }

      try {
        return buildEntry({
          pieceType,
          sourceName,
          rowIndex: index + 1 + headerOffset,
          caseCode,
          description,
          alg,
          memoWord,
          category,
          notes,
          lastSeenAt,
        });
      } catch (error) {
        const sourceLabel = sourceName || `${pieceType} csv`;
        throw new Error(
          `Failed to parse ${sourceLabel} row ${index + 1 + headerOffset} (${caseCode}): ${error.message}`
        );
      }
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
