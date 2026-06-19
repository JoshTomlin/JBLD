let cachedXlsxModule = null;

const SHEET_ORDER = [
  { pieceType: "edge", sheetName: "Edges" },
  { pieceType: "corner", sheetName: "Corners" },
  { pieceType: "twist", sheetName: "Twists" },
  { pieceType: "flip", sheetName: "Flips" },
  { pieceType: "parity", sheetName: "Parity" },
];

const HEADER_ROW = ["Case", "Description", "Alg", "Memo Word", "Category", "Notes"];

function getXlsxModule() {
  if (!cachedXlsxModule) {
    cachedXlsxModule = require("xlsx/dist/xlsx.full.min.js");
  }
  return cachedXlsxModule;
}

function normalizeCell(value) {
  return value === null || value === undefined ? "" : String(value);
}

function sortEntries(entries = []) {
  return entries.slice().sort((a, b) => {
    const rowA = Number.isFinite(Number(a.row_index)) ? Number(a.row_index) : Number.POSITIVE_INFINITY;
    const rowB = Number.isFinite(Number(b.row_index)) ? Number(b.row_index) : Number.POSITIVE_INFINITY;
    if (rowA !== rowB) {
      return rowA - rowB;
    }

    return String(a.case_code || "").localeCompare(String(b.case_code || ""));
  });
}

export function exportAlgLibraryWorkbook(entries = []) {
  const XLSX = getXlsxModule();
  const workbook = XLSX.utils.book_new();
  const safeEntries = Array.isArray(entries) ? entries : [];

  SHEET_ORDER.forEach(({ pieceType, sheetName }) => {
    const rows = sortEntries(safeEntries.filter((entry) => entry && entry.piece_type === pieceType)).map((entry) => [
      normalizeCell(entry.case_code),
      normalizeCell(entry.description),
      normalizeCell(entry.alg),
      normalizeCell(entry.memo_word),
      normalizeCell(entry.category),
      normalizeCell(entry.notes),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([HEADER_ROW, ...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  return {
    buffer: XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
    entryCount: safeEntries.length,
    fileName: "jbld-alg-library.xlsx",
  };
}
