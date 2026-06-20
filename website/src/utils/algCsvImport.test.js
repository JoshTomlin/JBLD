const { extractAlgLibraryEntriesFromCsv } = require("./algCsvImport");

describe("algCsvImport", () => {
  it("extracts entries from a header-based csv file", () => {
    const csvText = [
      "case_code,alg",
      'AB,"[R\' D\' R , U2]"',
      'AD,"[U\' : [R D R\' , U2]]"',
    ].join("\n");

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "corner", "corners.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "corner",
          sheetName: "corners.csv",
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
      ])
    );
  });

  it("supports two-column csv files without a header", () => {
    const csvText = ['AB,"[R2 U\' : [S , R2\']]"', "AD,R U R'"].join("\n");

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "edge", "edges.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "AB",
          expandedAlg: "R2 U' S R2' S' R2 U R2",
        }),
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "AD",
          expandedAlg: "R U R'",
        }),
      ])
    );
  });

  it("expands repeated grouped alg notation from csv descriptions", () => {
    const csvText = ['BS,"(U M U M\')2"'].join("\n");

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "edge", "edges.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pieceType: "edge",
          caseCode: "BS",
          expandedAlg: "U M U M' U M U M'",
        }),
      ])
    );
  });

  it("expands repeated grouped alg notation from a dedicated csv alg column", () => {
    const csvText = ['Name,Description,Alg', 'BS,"(U M U M\')2","(U M U M\')2"'].join("\n");

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "edge", "edges.csv");

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
  });

  it("maps memo words and metadata onto the same entry when the csv has dedicated columns", () => {
    const csvText = [
      "Pair,Description,Alg,Memo,Category,Notes",
      'AB,"[R\' B\' R : [R D R\' , U\']]","R\' B\' R2 D R\' U\' R D\' R\' U R\' B R",Abe,Main set,Fast',
    ].join("\n");

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "corner", "corners.csv");

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
        }),
      ])
    );
  });

  it("repairs missing trailing closing brackets from csv algs", () => {
    const csvText = 'case_code,alg\nIN,"[R\' F\' R D U : [U2 , R\' D\' R]"';

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "corner", "corners.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseCode: "IN",
          expandedAlg: "R' F' R D U' R' D' R U2 R' D R U' D' R' F R",
        }),
      ])
    );
  });

  it("repairs extra trailing closing brackets from csv algs", () => {
    const csvText = 'case_code,alg\nEQ,"[R\' , F\' L F]]"';

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "corner", "corners.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseCode: "EQ",
          expandedAlg: "R' F' L F R F' L' F",
        }),
      ])
    );
  });

  it("strips a UTF-8 bom from the first case code cell", () => {
    const csvText = '\uFEFFcase_code,alg\nAB,"[R\' D\' R , U2]"';

    const entries = extractAlgLibraryEntriesFromCsv(csvText, "corner", "corners.csv");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseCode: "AB",
          id: "corner-ab",
        }),
      ])
    );
  });
});
