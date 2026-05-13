import type { slides_v1 } from "googleapis";
import { describe, expect, it } from "vitest";

import { resolvePresentationOperations } from "./slides_resolver";

type TestElement = {
  objectId: string;
  text?: string;
  shapeType?: string;
  placeholderType?: string;
  group?: TestElement[];
  tableCells?: string[][];
};

function makePresentation(
  slides: Array<{
    objectId: string;
    elements?: TestElement[];
    notesObjectId?: string;
  }>
): slides_v1.Schema$Presentation {
  function makeElement(e: TestElement): slides_v1.Schema$PageElement {
    const base: slides_v1.Schema$PageElement = { objectId: e.objectId };
    if (e.tableCells) {
      base.table = {
        rows: e.tableCells.length,
        columns: e.tableCells[0]?.length ?? 0,
        tableRows: e.tableCells.map(
          (row): slides_v1.Schema$TableRow => ({
            tableCells: row.map(
              (text): slides_v1.Schema$TableCell => ({
                text: { textElements: [{ textRun: { content: text } }] },
              })
            ),
          })
        ),
      };
    } else if (e.group) {
      base.elementGroup = { children: e.group.map(makeElement) };
    } else {
      const shape: slides_v1.Schema$Shape = {};
      if (e.shapeType) {
        shape.shapeType = e.shapeType;
      }
      if (e.placeholderType) {
        shape.placeholder = { type: e.placeholderType };
      }
      if (e.text !== undefined) {
        shape.text = { textElements: [{ textRun: { content: e.text } }] };
      }
      base.shape = shape;
    }
    return base;
  }
  return {
    presentationId: "pres1",
    slides: slides.map(
      (s): slides_v1.Schema$Page => ({
        objectId: s.objectId,
        pageElements: (s.elements ?? []).map(makeElement),
        slideProperties: s.notesObjectId
          ? {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: s.notesObjectId,
                },
              },
            }
          : undefined,
      })
    ),
  };
}

describe("resolvePresentationOperations", () => {
  describe("slideNumber → objectId resolution", () => {
    it("should resolve deleteSlide by 1-indexed slide number", () => {
      const pres = makePresentation([
        { objectId: "slide_a" },
        { objectId: "slide_b" },
        { objectId: "slide_c" },
      ]);
      const res = resolvePresentationOperations(pres, [
        { type: "deleteSlide", slideNumber: 2 },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].deleteObject?.objectId).toBe("slide_b");
      }
    });

    it("should return an error when slide number is out of range", () => {
      const pres = makePresentation([{ objectId: "slide_a" }]);
      const res = resolvePresentationOperations(pres, [
        { type: "deleteSlide", slideNumber: 5 },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("deleteElement", () => {
    it("should find an element by text content", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            { objectId: "el_1", text: "Title" },
            { objectId: "el_2", text: "Body content" },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        { type: "deleteElement", slideNumber: 1, contains: "Body" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].deleteObject?.objectId).toBe("el_2");
      }
    });

    it("should return an error when no element matches", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "el_1", text: "Title" }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        { type: "deleteElement", slideNumber: 1, contains: "Missing" },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("replaceAllText with slideNumbers scope", () => {
    it("should run document-wide when slideNumbers is omitted", () => {
      const pres = makePresentation([]);
      const res = resolvePresentationOperations(pres, [
        { type: "replaceAllText", find: "foo", replace: "bar" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].replaceAllText;
        expect(req?.pageObjectIds).toBeUndefined();
      }
    });

    it("should restrict to the resolved slide objectIds when slideNumbers given", () => {
      const pres = makePresentation([
        { objectId: "slide_a" },
        { objectId: "slide_b" },
        { objectId: "slide_c" },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceAllText",
          find: "foo",
          replace: "bar",
          slideNumbers: [1, 3],
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].replaceAllText;
        expect(req?.pageObjectIds).toEqual(["slide_a", "slide_c"]);
      }
    });

    it("should return an error when a slideNumber is out of range", () => {
      const pres = makePresentation([{ objectId: "slide_a" }]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceAllText",
          find: "foo",
          replace: "bar",
          slideNumbers: [99],
        },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("replaceShapeText", () => {
    it("should resolve a shape by text content and emit deleteText + insertText", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            { objectId: "el_1", text: "Title" },
            { objectId: "el_2", text: "Body content" },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byText: "Title" },
          content: "New Title",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toHaveLength(2);
        expect(res.value[0].deleteText?.objectId).toBe("el_1");
        expect(res.value[1].insertText?.objectId).toBe("el_1");
        expect(res.value[1].insertText?.text).toBe("New Title");
      }
    });

    it("should resolve a shape by 0-indexed position", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            { objectId: "el_1", text: "First" },
            { objectId: "el_2", text: "Second" },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byIndex: 1 },
          content: "X",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[1].insertText?.objectId).toBe("el_2");
      }
    });

    it("should resolve a TITLE placeholder by type", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            { objectId: "title_id", placeholderType: "TITLE", text: "Old" },
            { objectId: "body_id", placeholderType: "BODY", text: "Body" },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byType: "TITLE" },
          content: "New Title",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[1].insertText?.objectId).toBe("title_id");
      }
    });

    it("should resolve a TEXT_BOX by shapeType", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            { objectId: "title_id", placeholderType: "TITLE", text: "T" },
            { objectId: "tb_id", shapeType: "TEXT_BOX", text: "Box text" },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byType: "TEXT_BOX" },
          content: "New",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[1].insertText?.objectId).toBe("tb_id");
      }
    });

    it("should recurse into grouped shapes when resolving byText", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            {
              objectId: "group_1",
              group: [
                { objectId: "child_1", text: "nested target" },
                { objectId: "child_2", text: "other" },
              ],
            },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byText: "nested target" },
          content: "X",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[1].insertText?.objectId).toBe("child_1");
      }
    });

    it("should skip the delete when the shape is empty", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "empty_id", text: "" }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceShapeText",
          slideNumber: 1,
          shapeIdentifier: { byIndex: 0 },
          content: "New",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toHaveLength(1);
        expect(res.value[0].insertText?.text).toBe("New");
      }
    });
  });

  describe("insertInShape", () => {
    it("should use insertionIndex=0 for position start", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "el_1", text: "Hello" }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "insertInShape",
          slideNumber: 1,
          shapeIdentifier: { byIndex: 0 },
          content: "> ",
          position: "start",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].insertText?.insertionIndex).toBe(0);
      }
    });

    it("should use the shape's current text length for position end", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "el_1", text: "Hello" }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "insertInShape",
          slideNumber: 1,
          shapeIdentifier: { byIndex: 0 },
          content: " world",
          position: "end",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].insertText?.insertionIndex).toBe(5);
      }
    });
  });

  describe("replaceSlideTableCell", () => {
    it("should emit deleteText + insertText with cellLocation", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [
            {
              objectId: "table_1",
              tableCells: [
                ["A", "B"],
                ["C", "D"],
              ],
            },
          ],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceSlideTableCell",
          slideNumber: 1,
          tableIndex: 0,
          rowIndex: 1,
          columnIndex: 0,
          content: "X",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toHaveLength(2);
        const del = res.value[0].deleteText;
        const ins = res.value[1].insertText;
        expect(del?.objectId).toBe("table_1");
        expect(del?.cellLocation).toEqual({ rowIndex: 1, columnIndex: 0 });
        expect(ins?.objectId).toBe("table_1");
        expect(ins?.cellLocation).toEqual({ rowIndex: 1, columnIndex: 0 });
        expect(ins?.text).toBe("X");
      }
    });

    it("should return an error when tableIndex is out of range", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "table_1", tableCells: [["A"]] }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceSlideTableCell",
          slideNumber: 1,
          tableIndex: 3,
          rowIndex: 0,
          columnIndex: 0,
          content: "X",
        },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("replaceNotes", () => {
    it("should target the speakerNotesObjectId on the slide", () => {
      const pres = makePresentation([
        { objectId: "slide_a", notesObjectId: "notes_1" },
      ]);
      const res = resolvePresentationOperations(pres, [
        { type: "replaceNotes", slideNumber: 1, content: "New notes" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value[0].deleteText?.objectId).toBe("notes_1");
        expect(res.value[1].insertText?.objectId).toBe("notes_1");
        expect(res.value[1].insertText?.text).toBe("New notes");
      }
    });

    it("should return an error when the slide has no notes shape", () => {
      const pres = makePresentation([{ objectId: "slide_a" }]);
      const res = resolvePresentationOperations(pres, [
        { type: "replaceNotes", slideNumber: 1, content: "X" },
      ]);
      expect(res.isErr()).toBe(true);
    });
  });

  describe("addTextBox", () => {
    it("should produce createShape + insertText requests", () => {
      const pres = makePresentation([{ objectId: "slide_a" }]);
      const res = resolvePresentationOperations(pres, [
        { type: "addTextBox", slideNumber: 1, text: "Hello" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toHaveLength(2);
        const create = res.value[0].createShape;
        const insert = res.value[1].insertText;
        expect(create?.shapeType).toBe("TEXT_BOX");
        expect(create?.elementProperties?.pageObjectId).toBe("slide_a");
        expect(insert?.text).toBe("Hello");
        expect(insert?.objectId).toBe(create?.objectId);
      }
    });
  });

  describe("raw escape hatch", () => {
    it("should pass raw requests through unchanged", () => {
      const pres = makePresentation([]);
      const rawReq = { updateSlideProperties: { objectId: "x", fields: "*" } };
      const res = resolvePresentationOperations(pres, [
        { type: "raw", request: rawReq },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([rawReq]);
      }
    });
  });
});
