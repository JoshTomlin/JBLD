import { expandCommNotation, hasCommNotation } from "./commNotation";

let cachedXlsxModule = null;

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

function buildEntry({ sheetName, rowIndex, caseCode, notation }) {
  const pieceType = inferPieceType(sheetName);
  const expandedAlg = expandWorkbookNotation(notation);

  return {
    id: `${pieceType}-${caseCode}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
    pieceType,
    sheetName,
    rowIndex,
    caseCode,
    notation,
    expandedAlg,
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

    rows.forEach((row, index) => {
      const caseCode = normalizeCell(row[0]);
      const notation = normalizeCell(row[1]);

      if (!caseCode || !notation) {
        return;
      }

      entries.push(
        buildEntry({
          sheetName,
          rowIndex: index + 1,
          caseCode,
          notation,
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
