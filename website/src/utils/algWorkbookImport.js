import * as XLSX from "xlsx";
import { expandCommNotation, hasCommNotation } from "./commNotation";

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

function buildEntry({ sheetName, rowIndex, caseCode, notation }) {
  const pieceType = inferPieceType(sheetName);
  const expandedAlg = hasCommNotation(notation)
    ? expandCommNotation(notation)
    : notation;

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

export function extractAlgLibraryEntriesFromWorkbook(workbook) {
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
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
  });

  return extractAlgLibraryEntriesFromWorkbook(workbook);
}
