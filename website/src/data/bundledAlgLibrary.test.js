const { getBundledAlgLibraryEntries } = require("./bundledAlgLibrary");

describe("bundledAlgLibrary", () => {
  it("parses the bundled library seed from the current source sheets", () => {
    const entries = getBundledAlgLibraryEntries();

    expect(entries).toHaveLength(1821);
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
          pieceType: "edge",
          caseCode: "BS",
          description: "(U M U M')2",
          alg: "U M U M' U M U M'",
          category: "Alg",
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
          pieceType: "twist",
          caseCode: "N",
          description: "[U , R' D R D' R' D R]",
          alg: "U R' D R D' R' D R U' R' D' R D R' D' R",
          category: "Twister",
          notes: null,
        }),
        expect.objectContaining({
          pieceType: "flip",
          caseCode: "CA",
          description: "U' Start",
          alg: "U' S R' F' R S' R' F R U' M' U2 M",
          category: "Cyclic-Shift",
          notes: null,
        }),
        expect.objectContaining({
          pieceType: "parity",
          caseCode: "B",
          description: "[Jb Perm] U'",
          category: "B set-up",
          notes: null,
        }),
      ])
    );
  });
});
