const SPECIAL_LABELS = {
  twist: "Twist",
  flip: "Flip",
  parity: "Parity",
};

export function getAlgLibrarySpecialType(pieceType) {
  const value = String(pieceType || "").trim().toLowerCase();
  if (value === "rotation") {
    return "twist";
  }
  return Object.prototype.hasOwnProperty.call(SPECIAL_LABELS, value) ? value : "";
}

export function getAlgLibrarySpecialLabel(pieceType) {
  const specialType = getAlgLibrarySpecialType(pieceType);
  return specialType ? SPECIAL_LABELS[specialType] : "";
}

export function normalizeAlgLibraryCaseCode(pieceType, caseCode) {
  const value = String(caseCode || "").trim().toUpperCase();
  const specialType = getAlgLibrarySpecialType(pieceType);
  if (!value || !specialType) {
    return String(caseCode || "").trim();
  }
  if (specialType === "parity") {
    return value;
  }
  return Array.from(value).sort((left, right) => left.localeCompare(right)).join("");
}

export function getDefaultAlgLibraryMemoWord(pieceType, caseCode) {
  const specialType = getAlgLibrarySpecialType(pieceType);
  return specialType ? formatAlgLibrarySpecialCaseLabel(specialType, caseCode) : "";
}

export function formatAlgLibrarySpecialCaseLabel(pieceType, caseCode) {
  const specialLabel = getAlgLibrarySpecialLabel(pieceType);
  const normalizedCaseCode = normalizeAlgLibraryCaseCode(pieceType, caseCode);
  if (!specialLabel) {
    return normalizedCaseCode;
  }
  return normalizedCaseCode ? `${normalizedCaseCode}-${specialLabel}` : specialLabel;
}

export function normalizeAlgLibrarySpecialLabel(text) {
  const value = String(text || "").trim();
  const match = value.match(/^([A-Za-z]+)\s*-?\s*(twist|rotation|flip|parity)$/i);
  if (!match) {
    return value;
  }
  return formatAlgLibrarySpecialCaseLabel(match[2], match[1]);
}

export function getAlgLibraryCaseLookupCodes(pieceType, caseCode) {
  const rawCaseCode = String(caseCode || "").trim().toUpperCase();
  const normalizedCaseCode = normalizeAlgLibraryCaseCode(pieceType, rawCaseCode);
  const codes = [rawCaseCode, normalizedCaseCode];
  const specialType = getAlgLibrarySpecialType(pieceType);
  if ((specialType === "twist" || specialType === "flip") && rawCaseCode.length === 2) {
    codes.push(Array.from(rawCaseCode).reverse().join(""));
  }
  return Array.from(new Set(codes.filter(Boolean)));
}

export function getAlgLibrarySearchNeedles(search) {
  const value = String(search || "").trim().toLowerCase();
  if (!value) {
    return [];
  }

  const normalizedSpecialLabel = normalizeAlgLibrarySpecialLabel(value).toLowerCase();
  const compactLetters = value.replace(/[^a-z]/g, "");
  const sortedLetters =
    compactLetters.length >= 2 && compactLetters.length <= 3
      ? Array.from(compactLetters).sort((left, right) => left.localeCompare(right)).join("")
      : "";

  return Array.from(new Set([value, normalizedSpecialLabel, sortedLetters].filter(Boolean)));
}

export function getAlgLibrarySearchAliases(entry = {}) {
  const pieceType = entry.piece_type || entry.pieceType || "";
  const caseCode = entry.case_code || entry.caseCode || "";
  const specialLabel = getAlgLibrarySpecialLabel(pieceType);
  const normalizedCaseCode = normalizeAlgLibraryCaseCode(pieceType, caseCode);
  const aliases = [
    caseCode,
    normalizedCaseCode,
  ];

  if (specialLabel) {
    aliases.push(
      `${caseCode}-${specialLabel}`,
      `${caseCode} ${specialLabel}`,
      `${normalizedCaseCode}-${specialLabel}`,
      `${normalizedCaseCode} ${specialLabel}`
    );
  }

  return Array.from(new Set(aliases.filter(Boolean).map((value) => String(value))));
}
