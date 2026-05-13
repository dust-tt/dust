import type { docs_v1 } from "googleapis";
import { describe, expect, it } from "vitest";

import { resolveDocOperations } from "./resolve_document_operations";

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
});
