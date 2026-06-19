import { expandCommNotation, hasCommNotation } from "./commNotation";

let cachedXlsxModule = null;
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

function getXlsxModule() {
  if (!cachedXlsxModule) {
    cachedXlsxModule = require("xlsx/dist/xlsx.full.min.js");
  }
  return cachedXlsxModule;
}

function normalizeCell(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function inferPieceType(sheetName = "") {
  const normalized = String(sheetName || "").toLowerCase();
  if (normalized.includes("corner")) {
    return "corner";
  }
  if (normalized.includes("edge")) {
    return "edge";
  }
  return "unknown";
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

function closeTrailingBracketGap(notation = "") {
  const value = String(notation || "").trim();
  const openCount = (value.match(/\[/g) || []).length;
  const closeCount = (value.match(/\]/g) || []).length;

  if (openCount <= closeCount) {
    return value;
  }

  return `${value}${"]".repeat(openCount - closeCount)}`;
}

function expandWorkbookNotation(notation = "") {
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

function buildEntry({ sheetName, rowIndex, caseCode, description, alg, memoWord, category, notes }) {
  const pieceType = inferPieceType(sheetName);
  const normalizedDescription = normalizeCell(description);
  const expandedAlg = normalizeCell(alg) || expandWorkbookNotation(normalizedDescription);

  return {
    id: `${pieceType}-${caseCode}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
    pieceType,
    sheetName,
    rowIndex,
    caseCode,
    notation: normalizedDescription,
    expandedAlg,
    description: normalizedDescription,
    alg: expandedAlg,
    memoWord: normalizeCell(memoWord) || null,
    category: normalizeCell(category) || null,
    notes: normalizeCell(notes) || null,
  };
}

async function readWorkbookFileAsArrayBuffer(file) {
  if (file && typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  if (typeof FileReader !== "undefined" && file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read workbook file"));
      reader.readAsArrayBuffer(file);
    });
  }

  throw new Error("This browser cannot read the selected Excel file.");
}

export function extractAlgLibraryEntriesFromWorkbook(workbook) {
  const XLSX = getXlsxModule();
  const entries = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });

    const headerOffset = rows.length && detectHeaderRow(rows[0]) ? 1 : 0;
    const headerRow = headerOffset ? rows[0] : [];
    const caseColumnIndex = headerOffset ? resolveColumnIndex(headerRow, HEADER_CASE_FIELDS, 0) : 0;
    const descriptionColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_DESCRIPTION_FIELDS) : 1;
    const algColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_ALG_FIELDS) : -1;
    const memoColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_MEMO_FIELDS) : -1;
    const categoryColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_CATEGORY_FIELDS) : -1;
    const notesColumnIndex = headerOffset ? resolveOptionalColumnIndex(headerRow, HEADER_NOTES_FIELDS) : -1;

    rows.slice(headerOffset).forEach((row, index) => {
      const caseCode = normalizeCell(row[caseColumnIndex]);
      const description =
        normalizeCell(row[descriptionColumnIndex]) ||
        normalizeCell(row[algColumnIndex >= 0 ? algColumnIndex : 1]);
      const hasDedicatedAlgColumn = descriptionColumnIndex >= 0 && algColumnIndex >= 0;
      const alg = hasDedicatedAlgColumn ? normalizeCell(row[algColumnIndex]) : "";
      const memoWord = memoColumnIndex >= 0 ? normalizeCell(row[memoColumnIndex]) : "";
      const category = categoryColumnIndex >= 0 ? normalizeCell(row[categoryColumnIndex]) : "";
      const notes = notesColumnIndex >= 0 ? normalizeCell(row[notesColumnIndex]) : "";

      if (!caseCode || !description) {
        return;
      }

      entries.push(
        buildEntry({
          sheetName,
          rowIndex: index + 1 + headerOffset,
          caseCode,
          description,
          alg,
          memoWord,
          category,
          notes,
        })
      );
    });
  });

  return entries;
}

export async function importAlgWorkbookFile(file) {
  const XLSX = getXlsxModule();
  const buffer = await readWorkbookFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, {
    type: "array",
  });

  return extractAlgLibraryEntriesFromWorkbook(workbook);
}
