import type { sheets_v4 } from "googleapis";
import { describe, expect, it } from "vitest";

import { resolveSpreadsheetOperations } from "./sheets_resolver";

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

describe("resolveSpreadsheetOperations", () => {
  describe("A1 notation → GridRange", () => {
    it("should parse 'Sheet1!A1:D10' into a full GridRange", () => {
      const ss = makeSpreadsheet([{ title: "Sheet1", sheetId: 42 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "mergeCells", range: "Sheet1!A1:D10", mergeType: "MERGE_ALL" },
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

    it("should use the first sheet when no sheet name is given", () => {
      const ss = makeSpreadsheet([
        { title: "Alpha", sheetId: 1 },
        { title: "Beta", sheetId: 2 },
      ]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "mergeCells", range: "A1:B2", mergeType: "MERGE_ALL" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests[0].mergeCells?.range?.sheetId).toBe(1);
      }
    });

    it("should return an error when the sheet name is unknown", () => {
      const ss = makeSpreadsheet([{ title: "Sheet1", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "mergeCells",
          range: "Missing!A1:B2",
          mergeType: "MERGE_ALL",
        },
      ]);
      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toContain("Missing");
      }
    });

    it("should parse single-cell ranges like 'A1'", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "mergeCells", range: "S!A1", mergeType: "MERGE_ALL" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batchRequests[0].mergeCells?.range).toEqual({
          sheetId: 1,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 1,
        });
      }
    });
  });

  describe("operation routing", () => {
    it("should route updateCells to valueUpdates, not batchRequests", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "updateCells", range: "S!A1:B2", values: [["a", "b"]] },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.valueUpdates).toHaveLength(1);
        expect(res.value.valueUpdates[0]).toEqual({
          range: "S!A1:B2",
          values: [["a", "b"]],
        });
        expect(res.value.batchRequests).toHaveLength(0);
      }
    });

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

  describe("formatRange", () => {
    it("should require at least one formatting property", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "formatRange", range: "S!A1:B2" },
      ]);
      expect(res.isErr()).toBe(true);
    });

    it("should convert hex color to RGB and set fields", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        {
          type: "formatRange",
          range: "S!A1:B2",
          bold: true,
          backgroundColorHex: "#FF0000",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const repeat = res.value.batchRequests[0].repeatCell;
        expect(repeat?.cell?.userEnteredFormat?.textFormat?.bold).toBe(true);
        expect(repeat?.cell?.userEnteredFormat?.backgroundColor).toEqual({
          red: 1,
          green: 0,
          blue: 0,
        });
        expect(repeat?.fields).toContain("userEnteredFormat.textFormat");
        expect(repeat?.fields).toContain("userEnteredFormat.backgroundColor");
      }
    });
  });

  describe("findReplace", () => {
    it("should use allSheets when no sheetTitle is given", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 1 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "findReplace", find: "x", replace: "y" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value.batchRequests[0].findReplace;
        expect(req?.allSheets).toBe(true);
        expect(req?.sheetId).toBeUndefined();
      }
    });

    it("should scope to a sheetId when sheetTitle is given", () => {
      const ss = makeSpreadsheet([{ title: "S", sheetId: 7 }]);
      const res = resolveSpreadsheetOperations(ss, [
        { type: "findReplace", find: "x", replace: "y", sheetTitle: "S" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value.batchRequests[0].findReplace;
        expect(req?.sheetId).toBe(7);
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
