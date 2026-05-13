import type { docs_v1 } from "googleapis";
import { describe, expect, it } from "vitest";

import { resolveDocOperations } from "./docs_resolver";

// Builds a minimal Schema$Document with one paragraph whose textRun has the
// given content. The paragraph spans [1, 1 + content.length).
function makeSimpleDoc(content: string): docs_v1.Schema$Document {
  const endIndex = 1 + content.length;
  return {
    documentId: "doc1",
    body: {
      content: [
        {
          startIndex: 1,
          endIndex,
          paragraph: {
            elements: [
              {
                startIndex: 1,
                endIndex,
                textRun: { content },
              },
            ],
          },
        },
      ],
    },
  };
}

describe("resolveDocOperations", () => {
  describe("text anchor resolution", () => {
    it("should find an exact match for deleteText", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        { type: "deleteText", text: "world" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          { deleteContentRange: { range: { startIndex: 7, endIndex: 12 } } },
        ]);
      }
    });

    it("should return an error when anchor text is not found", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        { type: "deleteText", text: "missing" },
      ]);
      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toContain("missing");
      }
    });

    it("should use the first match when multiple occurrences exist", () => {
      const doc = makeSimpleDoc("foo bar foo baz\n");
      const res = resolveDocOperations(doc, [
        { type: "deleteText", text: "foo" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          { deleteContentRange: { range: { startIndex: 1, endIndex: 4 } } },
        ]);
      }
    });
  });

  describe("insertText", () => {
    it("should resolve 'start' to index 1", () => {
      const doc = makeSimpleDoc("Hello!\n");
      const res = resolveDocOperations(doc, [
        { type: "insertText", text: "X", location: "start" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          { insertText: { text: "X", location: { index: 1 } } },
        ]);
      }
    });

    it("should resolve 'end' to body endIndex - 1", () => {
      const doc = makeSimpleDoc("Hello!\n"); // endIndex = 8
      const res = resolveDocOperations(doc, [
        { type: "insertText", text: "X", location: "end" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          { insertText: { text: "X", location: { index: 7 } } },
        ]);
      }
    });

    it("should resolve afterText to the end of the matched range", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        {
          type: "insertText",
          text: "X",
          location: { afterText: "Hello" },
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          { insertText: { text: "X", location: { index: 6 } } },
        ]);
      }
    });

    it("should return an error when afterText anchor is missing", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        {
          type: "insertText",
          text: "X",
          location: { afterText: "missing" },
        },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("operation ordering", () => {
    it("should sort indexed operations from highest to lowest index", () => {
      const doc = makeSimpleDoc("AAAA BBBB CCCC\n");
      const res = resolveDocOperations(doc, [
        { type: "deleteText", text: "AAAA" }, // index 1
        { type: "deleteText", text: "CCCC" }, // index 11
        { type: "deleteText", text: "BBBB" }, // index 6
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const startIndices = res.value.map(
          (r) => r.deleteContentRange?.range?.startIndex
        );
        expect(startIndices).toEqual([11, 6, 1]);
      }
    });

    it("should place replaceText after indexed ops and raw ops last", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        { type: "replaceText", find: "world", replace: "there" },
        { type: "deleteText", text: "Hello" },
        {
          type: "raw",
          request: { createNamedRange: { name: "x", range: {} } },
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0]).toHaveProperty("deleteContentRange");
        expect(res.value[1]).toHaveProperty("replaceAllText");
        expect(res.value[2]).toHaveProperty("createNamedRange");
      }
    });
  });

  describe("formatText", () => {
    it("should emit an updateTextStyle with the right fields", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        { type: "formatText", text: "world", bold: true, fontSizePt: 14 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].updateTextStyle;
        expect(req?.range).toEqual({ startIndex: 7, endIndex: 12 });
        expect(req?.textStyle).toEqual({
          bold: true,
          fontSize: { magnitude: 14, unit: "PT" },
        });
        expect(req?.fields?.split(",").sort()).toEqual(["bold", "fontSize"]);
      }
    });

    it("should return an error when no formatting flag is set", () => {
      const doc = makeSimpleDoc("Hello world!\n");
      const res = resolveDocOperations(doc, [
        { type: "formatText", text: "world" },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("raw escape hatch", () => {
    it("should pass through raw requests unchanged", () => {
      const doc = makeSimpleDoc("Hello!\n");
      const rawReq = { insertPageBreak: { location: { index: 1 } } };
      const res = resolveDocOperations(doc, [{ type: "raw", request: rawReq }]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([rawReq]);
      }
    });
  });

  describe("table operations", () => {
    type CellSpec = string | { text: string; bullet?: boolean };

    function makeDocWithTable(
      cellContents: CellSpec[][]
    ): docs_v1.Schema$Document {
      // Build a doc with a single table. Each cell holds a single text run.
      // Indices are synthesised to mimic the Google Docs API shape:
      // table starts at index 1, each cell occupies (cellStart, cellEnd)
      // and the cell body is at cellStart + 1.
      let cursor = 2;
      const tableRows: docs_v1.Schema$TableRow[] = cellContents.map(
        (row): docs_v1.Schema$TableRow => {
          const tableCells: docs_v1.Schema$TableCell[] = row.map((spec) => {
            const text = typeof spec === "string" ? spec : spec.text;
            const bullet = typeof spec === "string" ? false : !!spec.bullet;
            const cellStart = cursor;
            const insertIndex = cellStart + 1;
            const endIndex = insertIndex + text.length + 1; // +1 for cell newline
            cursor = endIndex;
            return {
              startIndex: cellStart,
              endIndex,
              content: [
                {
                  startIndex: insertIndex,
                  endIndex: endIndex - 1,
                  paragraph: {
                    elements: [
                      {
                        startIndex: insertIndex,
                        endIndex: endIndex - 1,
                        textRun: { content: text },
                      },
                    ],
                    ...(bullet
                      ? { bullet: { listId: "kix-list-1", nestingLevel: 0 } }
                      : {}),
                  },
                },
              ],
            };
          });
          return { tableCells };
        }
      );
      const tableEndIndex = cursor;
      return {
        documentId: "doc-with-table",
        body: {
          content: [
            {
              startIndex: 1,
              endIndex: tableEndIndex,
              table: {
                rows: cellContents.length,
                columns: cellContents[0]?.length ?? 0,
                tableRows,
              },
            },
          ],
        },
      };
    }

    it("should replace a table cell with delete + insert at cellStart + 1", () => {
      const doc = makeDocWithTable([["A", "B"]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "X",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        // Two requests: deleteContentRange + insertText.
        expect(res.value).toHaveLength(2);
        // Both should target index 3 (cellStart=2, insertIndex=3).
        const insertReq = res.value.find((r) => r.insertText);
        const deleteReq = res.value.find((r) => r.deleteContentRange);
        expect(insertReq?.insertText?.location?.index).toBe(3);
        expect(insertReq?.insertText?.text).toBe("X");
        expect(deleteReq?.deleteContentRange?.range?.startIndex).toBe(3);
      }
    });

    it("should skip the delete when the cell is empty", () => {
      const doc = makeDocWithTable([[""]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "X",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toHaveLength(1);
        expect(res.value[0].insertText?.text).toBe("X");
      }
    });

    it("should return an error when tableIndex is out of range", () => {
      const doc = makeDocWithTable([["A"]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 5,
          rowIndex: 0,
          columnIndex: 0,
          content: "X",
        },
      ]);
      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toContain("out of range");
      }
    });

    it("should emit insertTableRow with insertBelow=true when afterRowIndex>=0", () => {
      const doc = makeDocWithTable([["A"], ["B"]]);
      const res = resolveDocOperations(doc, [
        { type: "insertTableRow", tableIndex: 0, afterRowIndex: 0 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].insertTableRow;
        expect(req?.insertBelow).toBe(true);
        expect(req?.tableCellLocation?.rowIndex).toBe(0);
        expect(req?.tableCellLocation?.tableStartLocation?.index).toBe(1);
      }
    });

    it("should emit insertTableRow with insertBelow=false when afterRowIndex=-1", () => {
      const doc = makeDocWithTable([["A"]]);
      const res = resolveDocOperations(doc, [
        { type: "insertTableRow", tableIndex: 0, afterRowIndex: -1 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].insertTableRow;
        expect(req?.insertBelow).toBe(false);
        expect(req?.tableCellLocation?.rowIndex).toBe(0);
      }
    });

    it("should emit deleteTableColumn with the right columnIndex", () => {
      const doc = makeDocWithTable([["A", "B", "C"]]);
      const res = resolveDocOperations(doc, [
        { type: "deleteTableColumn", tableIndex: 0, columnIndex: 1 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].deleteTableColumn;
        expect(req?.tableCellLocation?.columnIndex).toBe(1);
        expect(req?.tableCellLocation?.tableStartLocation?.index).toBe(1);
      }
    });

    it("should strip bullet markers when replacing a bulleted cell", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "• item one\n• item two",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("item one\nitem two");
      }
    });

    it("should strip numbered markers when replacing a numbered cell", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "1. First\n2. Second",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("First\nSecond");
      }
    });

    it("should preserve content as-is when the cell has no bullet styling", () => {
      const doc = makeDocWithTable([["plain"]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "• item one",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("• item one");
      }
    });

    it("should NOT strip digits that aren't followed by a period+space", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "5 years of experience",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("5 years of experience");
      }
    });

    it("should pass plain text through unchanged into a bulleted cell", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "Just plain text",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("Just plain text");
      }
    });

    it("should NOT strip markers when using insertInTableCell", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "insertInTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "• appended",
          position: "end",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        expect(insertReq?.insertText?.text).toBe("• appended");
      }
    });

    it("should drop blank lines between items in a bulleted cell", () => {
      const doc = makeDocWithTable([[{ text: "old", bullet: true }]]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "1. content\n\n2. more content\n   \n3. last",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReq = res.value.find((r) => r.insertText);
        // Blank/whitespace-only lines are dropped — otherwise Docs would
        // render them as empty numbered paragraphs ("2." between items).
        expect(insertReq?.insertText?.text).toBe("content\nmore content\nlast");
      }
    });

    it("should strip selectively in a mixed batch", () => {
      const doc = makeDocWithTable([
        [{ text: "bulleted_old", bullet: true }, "plain_old"],
      ]);
      const res = resolveDocOperations(doc, [
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 0,
          content: "• stripped",
        },
        {
          type: "replaceTableCell",
          tableIndex: 0,
          rowIndex: 0,
          columnIndex: 1,
          content: "• preserved",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const insertReqs = res.value.filter((r) => r.insertText);
        const texts = insertReqs
          .map((r) => r.insertText?.text)
          .filter((t): t is string => !!t);
        expect(texts).toContain("stripped");
        expect(texts).toContain("• preserved");
      }
    });
  });

  describe("header / footer operations", () => {
    function makeDocWithHeader(
      content: string,
      role: "default" | "firstPage" | "evenPages" = "default"
    ): docs_v1.Schema$Document {
      const segmentId = "kix-header-1";
      return {
        documentId: "doc-with-header",
        body: { content: [] },
        documentStyle:
          role === "default"
            ? { defaultHeaderId: segmentId }
            : role === "firstPage"
              ? { firstPageHeaderId: segmentId }
              : { evenPageHeaderId: segmentId },
        headers: {
          [segmentId]: {
            content: [
              {
                startIndex: 0,
                endIndex: content.length + 1,
                paragraph: {
                  elements: [
                    {
                      startIndex: 0,
                      endIndex: content.length + 1,
                      textRun: { content },
                    },
                  ],
                },
              },
            ],
          },
        },
      };
    }

    it("should emit replaceAllText (document-wide) for replaceHeaderFooterText", () => {
      const doc = makeDocWithHeader("Old title");
      const res = resolveDocOperations(doc, [
        {
          type: "replaceHeaderFooterText",
          segment: "header",
          role: "default",
          find: "Old",
          replace: "New",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].replaceAllText?.containsText?.text).toBe("Old");
        expect(res.value[0].replaceAllText?.replaceText).toBe("New");
      }
    });

    it("should include segmentId on insertInHeaderFooter", () => {
      const doc = makeDocWithHeader("Header");
      const res = resolveDocOperations(doc, [
        {
          type: "insertInHeaderFooter",
          segment: "header",
          role: "default",
          content: " v2",
          position: "end",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].insertText?.location?.segmentId).toBe(
          "kix-header-1"
        );
        expect(res.value[0].insertText?.text).toBe(" v2");
      }
    });

    it("should return an error when the requested header role doesn't exist", () => {
      const doc = makeDocWithHeader("Default header");
      const res = resolveDocOperations(doc, [
        {
          type: "insertInHeaderFooter",
          segment: "header",
          role: "evenPages",
          content: "X",
          position: "end",
        },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });
});
