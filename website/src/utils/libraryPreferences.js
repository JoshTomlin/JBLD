export const LIBRARY_PREFERENCES_KEY = "jbld-library-preferences";
const TYPES = ["all", "edge", "corner", "twist", "flip", "parity"];

export function normalizeLibraryFilters(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    pieceType: TYPES.includes(source.pieceType) ? source.pieceType : "all",
    group: typeof source.group === "string" && source.group.trim() ? source.group.trim() : "all",
    search: typeof source.search === "string" ? source.search : "",
  };
}

export function normalizeLibraryPreferences(value) {
  const source = value && typeof value === "object" && value.version === 1 ? value : {};
  const ids = new Set();
  const names = new Set();
  const saved = (Array.isArray(source.saved) ? source.saved : []).filter((entry) => {
    if (!entry || typeof entry.id !== "string" || !entry.id || typeof entry.name !== "string" || !entry.name.trim()) return false;
    const name = entry.name.trim().toLowerCase();
    if (ids.has(entry.id) || names.has(name)) return false;
    ids.add(entry.id);
    names.add(name);
    return true;
  }).map((entry) => ({ id: entry.id, name: entry.name.trim(), filters: normalizeLibraryFilters(entry.filters) }));
  return { version: 1, lastUsed: normalizeLibraryFilters(source.lastUsed), saved };
}

export function readLibraryPreferences() {
  try {
    return normalizeLibraryPreferences(JSON.parse(window.localStorage.getItem(LIBRARY_PREFERENCES_KEY)));
  } catch (_error) {
    return normalizeLibraryPreferences(null);
  }
}

export function writeLibraryPreferences(value) {
  try {
    window.localStorage.setItem(LIBRARY_PREFERENCES_KEY, JSON.stringify(normalizeLibraryPreferences(value)));
    return true;
  } catch (_error) {
    return false;
  }
}

export function sameLibraryFilters(left, right) {
  const a = normalizeLibraryFilters(left);
  const b = normalizeLibraryFilters(right);
  return a.pieceType === b.pieceType && a.group === b.group && a.search.trim().toLowerCase() === b.search.trim().toLowerCase();
}
