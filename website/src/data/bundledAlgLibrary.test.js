const { getBundledAlgLibraryEntries } = require("./bundledAlgLibrary");

describe("bundledAlgLibrary", () => {
  it("parses the bundled library seed from all five csv files", () => {
    const entries = getBundledAlgLibraryEntries();

    expect(entries).toHaveLength(1657);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "AB",
          description: "[R' B' R : [R D R' , U']]",
          alg: "R' B' R2 D R' U' R D' R' U R' B R",
          category: "U'-swap",
        }),
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "AB",
          description: "[R2 U' : [S , R2']]",
          alg: "R2 U' S R2' S' R2 U R2",
        }),
        expect.objectContaining({
          pieceType: "corner_memo",
          caseCode: "AB",
          description: "Abe",
        }),
        expect.objectContaining({
          pieceType: "edge_memo",
          caseCode: "AB",
          description: "Abe",
        }),
        expect.objectContaining({
          pieceType: "parity",
          caseCode: "A",
          description: "U2 [Y Perm] U2",
          category: "A set-up",
          notes: null,
        }),
      ])
    );
  });
});
