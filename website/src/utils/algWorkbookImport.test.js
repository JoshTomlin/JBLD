const { extractAlgLibraryEntriesFromWorkbook } = require("./algWorkbookImport");

describe("algWorkbookImport", () => {
  it("extracts corner and edge entries and expands comm notation", () => {
    const workbook = {
      SheetNames: ["Corners", "Edges"],
      Sheets: {
        Corners: {},
        Edges: {},
      },
    };

    const spy = jest.spyOn(require("xlsx/dist/xlsx.full.min.js").utils, "sheet_to_json");

    spy
      .mockImplementationOnce(() => [
        ["AB", "[R' D' R , U2]"],
        ["AD", "[U' : [R D R' , U2]]"],
      ])
      .mockImplementationOnce(() => [["AB", "[R2 U' : [S , R2']]"]]);

    const entries = extractAlgLibraryEntriesFromWorkbook(workbook);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "AB",
          notation: "[R' D' R , U2]",
          expandedAlg: "R' D' R U2 R' D R U2",
        }),
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "AD",
          notation: "[U' : [R D R' , U2]]",
          expandedAlg: "U' R D R' U2 R D' R' U'",
        }),
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "AB",
          notation: "[R2 U' : [S , R2']]",
          expandedAlg: "R2 U' S R2' S' R2 U R2",
        }),
      ])
    );

    spy.mockRestore();
  });

  it("repairs workbook rows with a missing trailing closing bracket", () => {
    const workbook = {
      SheetNames: ["Corners"],
      Sheets: {
        Corners: {},
      },
    };

    const spy = jest.spyOn(require("xlsx/dist/xlsx.full.min.js").utils, "sheet_to_json");

    spy.mockImplementationOnce(() => [["IN", "[R' F' R D U : [U2 , R' D' R]"]]);

    const entries = extractAlgLibraryEntriesFromWorkbook(workbook);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "IN",
          notation: "[R' F' R D U : [U2 , R' D' R]",
          expandedAlg: "R' F' R D U' R' D' R U2 R' D R U' D' R' F R",
        }),
      ])
    );

    spy.mockRestore();
  });

  it("keeps memo words and metadata on the same workbook entry when those columns exist", () => {
    const workbook = {
      SheetNames: ["Corners"],
      Sheets: {
        Corners: {},
      },
    };

    const spy = jest.spyOn(require("xlsx/dist/xlsx.full.min.js").utils, "sheet_to_json");

    spy.mockImplementationOnce(() => [
      ["Pair", "Description", "Alg", "Memo", "Category", "Notes", "Last Seen"],
      [
        "AB",
        "[R' B' R : [R D R' , U']]",
        "R' B' R2 D R' U' R D' R' U R' B R",
        "Abe",
        "Main set",
        "Fast",
        "2026-07-14T09:30:00.000Z",
      ],
    ]);

    const entries = extractAlgLibraryEntriesFromWorkbook(workbook);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          caseCode: "AB",
          description: "[R' B' R : [R D R' , U']]",
          alg: "R' B' R2 D R' U' R D' R' U R' B R",
          memoWord: "Abe",
          category: "Main set",
          notes: "Fast",
          lastSeenAt: "2026-07-14T09:30:00.000Z",
        }),
      ])
    );

    spy.mockRestore();
  });

  it("expands repeated grouped alg notation and recognizes twist sheets", () => {
    const workbook = {
      SheetNames: ["Twists"],
      Sheets: {
        Twists: {},
      },
    };

    const spy = jest.spyOn(require("xlsx/dist/xlsx.full.min.js").utils, "sheet_to_json");

    spy.mockImplementationOnce(() => [["N", "(U M U M')2"]]);

    const entries = extractAlgLibraryEntriesFromWorkbook(workbook);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "twist",
          caseCode: "N",
          expandedAlg: "U M U M' U M U M'",
        }),
      ])
    );

    spy.mockRestore();
  });

  it("expands repeated grouped alg notation from a dedicated workbook alg column", () => {
    const workbook = {
      SheetNames: ["Edges"],
      Sheets: {
        Edges: {},
      },
    };

    const spy = jest.spyOn(require("xlsx/dist/xlsx.full.min.js").utils, "sheet_to_json");

    spy.mockImplementationOnce(() => [["Name", "Description", "Alg"], ["BS", "(U M U M')2", "(U M U M')2"]]);

    const entries = extractAlgLibraryEntriesFromWorkbook(workbook);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "BS",
          alg: "U M U M' U M U M'",
          expandedAlg: "U M U M' U M U M'",
        }),
      ])
    );

    spy.mockRestore();
  });
});
