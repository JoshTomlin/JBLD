const { getBundledAlgLibraryEntries } = require("./bundledAlgLibrary");

describe("bundledAlgLibrary", () => {
  it("parses the bundled corner and edge libraries", () => {
    const entries = getBundledAlgLibraryEntries();

    expect(entries).toHaveLength(818);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "AB",
        }),
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "AB",
        }),
      ])
    );
  });
});
