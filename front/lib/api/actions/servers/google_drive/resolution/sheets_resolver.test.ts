import type { sheets_v4 } from "googleapis";
import { describe, expect, it } from "vitest";

import { parseA1Range, resolveSpreadsheetOperations } from "./sheets_resolver";

function makeSpreadsheet(
  sheets: Array<{ title: string; sheetId: number }>
): sheets_v4.Schema$Spreadsheet {
  return {
    spreadsheetId: "ss1",
    sheets: sheets.map((s) => ({
      properties: { title: s.title, sheetId: s.sheetId },
    })),
  };
}

describe("parseA1Range", () => {
  it("should parse a full rectangular range like 'A1:D10'", () => {
    const res = parseA1Range("A1:D10");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toEqual({
        startRowIndex: 0,
        endRowIndex: 10,
        startColumnIndex: 0,
        endColumnIndex: 4,
      });
    }
  });

  it("should parse a single cell like 'B3'", () => {
    const res = parseA1Range("B3");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toEqual({
        startRowIndex: 2,
        endRowIndex: 3,
        startColumnIndex: 1,
        endColumnIndex: 2,
      });
    }
  });

  it("should parse a whole-column range like 'A:C'", () => {
    const res = parseA1Range("A:C");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.startRowIndex).toBeNull();
      expect(res.value.endRowIndex).toBeNull();
      expect(res.value.startColumnIndex).toBe(0);
      expect(res.value.endColumnIndex).toBe(3);
    }
  });

  it("should handle multi-letter columns like 'AA1'", () => {
    const res = parseA1Range("AA1");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.startColumnIndex).toBe(26);
    }
  });

  it("should reject a range that includes a sheet prefix", () => {
    const res = parseA1Range("Sheet1!A1");
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("without the sheet prefix");
    }
  });

  it("should reject a malformed range", () => {
    const res = parseA1Range("A1:B2:C3");
    expect(res.isErr()).toBe(true);
  });
});

describe("resolveSpreadsheetOperations", () => {
  describe("updateCells", () => {
    it("should route values into valueUpdates with a quoted sheet name when needed", () => {
      const ss = makeSpreadsheet([{ title: "Sheet 1", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "updateCells",
          sheetName: "Sheet 1",
          range: "A1:B2",
          values: [
            ["a", "b"],
            [1, 2],
          ],
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.valueUpdates).toHaveLength(1);
        expect(res.value.valueUpdates[0].range).toBe("'Sheet 1'!A1:B2");
        expect(res.value.batchRequests).toHaveLength(0);
      }
    });

    it("should leave unquoted-safe sheet names unquoted", () => {
      const ss = makeSpreadsheet([{ title: "Sheet1", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "updateCells",
          sheetName: "Sheet1",
          range: "A1:B2",
          values: [["a", "b"]],
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.valueUpdates[0].range).toBe("Sheet1!A1:B2");
      }
    });

    it("should return an error when the sheet doesn't exist", () => {
      const ss = makeSpreadsheet([{ title: "Sheet1", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "updateCells",
          sheetName: "Missing",
          range: "A1",
          values: [["x"]],
        },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("formatCells", () => {
    it("should require at least one formatting property", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "formatCells", sheetName: "S", range: "A1:B2", format: {} },
      ]);
      expect(res.isErr()).toBe(true);
    });

    it("should pass through RGB colors and pack textFormat properties", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 7 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "formatCells",
          sheetName: "S",
          range: "A1:B2",
          format: {
            bold: true,
            fontSize: 12,
            backgroundColor: { red: 1, green: 0, blue: 0 },
            textColor: { red: 0, green: 0, blue: 1 },
            horizontalAlignment: "CENTER",
            numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
          },
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const repeat = res.value.batchRequests[0].repeatCell;
        expect(repeat?.range?.sheetId).toBe(7);
        expect(repeat?.cell?.userEnteredFormat?.textFormat?.bold).toBe(true);
        expect(repeat?.cell?.userEnteredFormat?.textFormat?.fontSize).toBe(12);
        expect(
          repeat?.cell?.userEnteredFormat?.textFormat?.foregroundColor
        ).toEqual({ red: 0, green: 0, blue: 1 });
        expect(repeat?.cell?.userEnteredFormat?.backgroundColor).toEqual({
          red: 1,
          green: 0,
          blue: 0,
        });
        expect(repeat?.cell?.userEnteredFormat?.horizontalAlignment).toBe(
          "CENTER"
        );
        expect(repeat?.cell?.userEnteredFormat?.numberFormat).toEqual({
          type: "CURRENCY",
          pattern: "$#,##0.00",
        });
        expect(repeat?.fields).toContain("userEnteredFormat.textFormat");
        expect(repeat?.fields).toContain("userEnteredFormat.numberFormat");
      }
    });
  });

  describe("findReplace", () => {
    it("should use allSheets when sheetName is omitted", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "findReplace",
          find: "x",
          replace: "y",
          matchCase: false,
          matchEntireCell: false,
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value.batchRequests[0].findReplace;
        expect(req?.allSheets).toBe(true);
        expect(req?.sheetId).toBeUndefined();
      }
    });

    it("should scope to a sheetId when sheetName is given", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 7 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "findReplace",
          find: "x",
          replace: "y",
          sheetName: "S",
          matchCase: false,
          matchEntireCell: true,
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value.batchRequests[0].findReplace;
        expect(req?.sheetId).toBe(7);
        expect(req?.matchEntireCell).toBe(true);
      }
    });
  });

  describe("row / column operations", () => {
    it("insertRows should derive endIndex from startIndex + count", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "insertRows", sheetName: "S", startIndex: 2, count: 3 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const range = res.value.batchRequests[0].insertDimension?.range;
        expect(range?.dimension).toBe("ROWS");
        expect(range?.startIndex).toBe(2);
        expect(range?.endIndex).toBe(5);
      }
    });

    it("deleteRows should pass startIndex/endIndex through directly", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "deleteRows", sheetName: "S", startIndex: 0, endIndex: 5 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const range = res.value.batchRequests[0].deleteDimension?.range;
        expect(range?.dimension).toBe("ROWS");
        expect(range?.startIndex).toBe(0);
        expect(range?.endIndex).toBe(5);
      }
    });

    it("insertColumns should target the COLUMNS dimension", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "insertColumns", sheetName: "S", startIndex: 1, count: 2 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const range = res.value.batchRequests[0].insertDimension?.range;
        expect(range?.dimension).toBe("COLUMNS");
        expect(range?.endIndex).toBe(3);
      }
    });
  });

  describe("sortRange", () => {
    it("should offset columnIndex by the range's start column (absolute on sheet)", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "sortRange",
          sheetName: "S",
          range: "C2:E10", // startColumnIndex = 2
          sortSpecs: [{ columnIndex: 1, ascending: false }],
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const sort = res.value.batchRequests[0].sortRange;
        expect(sort?.sortSpecs?.[0].dimensionIndex).toBe(3); // 2 + 1
        expect(sort?.sortSpecs?.[0].sortOrder).toBe("DESCENDING");
      }
    });
  });

  describe("mergeCells", () => {
    it("should emit mergeCells with the resolved GridRange", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 42 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "mergeCells",
          sheetName: "S",
          range: "A1:D10",
          mergeType: "MERGE_ALL",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests[0].mergeCells?.range).toEqual({
          sheetId: 42,
          startRowIndex: 0,
          endRowIndex: 10,
          startColumnIndex: 0,
          endColumnIndex: 4,
        });
      }
    });
  });

  describe("addSheet / deleteSheet", () => {
    it("should resolve addSheet without needing a sheet lookup", () => {
      const ss = makeSpreadsheet([{ title: "Existing", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "addSheet", title: "New" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests[0].addSheet?.properties?.title).toBe(
          "New"
        );
      }
    });

    it("should resolve deleteSheet by title to sheetId", () => {
      const ss = makeSpreadsheet([
        { title: "Keep", sheetId: 1 },
        { title: "Drop", sheetId: 2 },
      ]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "deleteSheet", title: "Drop" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests[0].deleteSheet?.sheetId).toBe(2);
      }
    });
  });

  describe("raw escape hatch", () => {
    it("should pass raw requests through to batchRequests", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const rawReq = { setBasicFilter: { filter: { range: { sheetId: 1 } } } };
      const res = resolveSpreadsheetOperations(ss, [
        { type: "raw", request: rawReq },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests).toEqual([rawReq]);
      }
    });
  });
});
