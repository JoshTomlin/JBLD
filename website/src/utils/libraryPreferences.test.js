import { LIBRARY_PREFERENCES_KEY, normalizeLibraryPreferences, readLibraryPreferences, writeLibraryPreferences } from "./libraryPreferences";

beforeEach(() => localStorage.clear());

test("saved filters and the last search survive reopening the library", () => {
  const filters = { pieceType: "edge", group: "4-Mover", search: "Abe" };
  const preferences = { version: 1, lastUsed: filters, saved: [{ id: "edge4", name: "Quick edges", filters }] };
  expect(writeLibraryPreferences(preferences)).toBe(true);
  expect(readLibraryPreferences()).toEqual(preferences);
});

test("corrupt preferences do not prevent the library from opening", () => {
  localStorage.setItem(LIBRARY_PREFERENCES_KEY, "{broken");
  expect(readLibraryPreferences()).toEqual({ version: 1, lastUsed: { pieceType: "all", group: "all", search: "" }, saved: [] });
  expect(normalizeLibraryPreferences({ version: 1, lastUsed: { pieceType: "missing" }, saved: [null, { id: "x", name: "  " }] }).saved).toEqual([]);
});

test("duplicate names in imported preferences are unambiguous", () => {
  const preferences = normalizeLibraryPreferences({ version: 1, saved: [
    { id: "one", name: " Edges ", filters: { pieceType: "edge" } },
    { id: "two", name: "edges", filters: { pieceType: "corner" } },
  ] });
  expect(preferences.saved).toHaveLength(1);
  expect(preferences.saved[0].name).toBe("Edges");
});

test("a storage failure leaves existing saved preferences untouched", () => {
  writeLibraryPreferences({ version: 1, saved: [{ id: "one", name: "Edges", filters: { pieceType: "edge" } }] });
  const prior = localStorage.getItem(LIBRARY_PREFERENCES_KEY);
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  try {
    expect(writeLibraryPreferences({ version: 1, saved: [] })).toBe(false);
    expect(localStorage.getItem(LIBRARY_PREFERENCES_KEY)).toBe(prior);
  } finally { setItem.mockRestore(); }
});
