import type { slides_v1 } from "googleapis";
import { describe, expect, it } from "vitest";

import { resolvePresentationOperations } from "./slides_resolver";

function makePresentation(
  slides: Array<{
    objectId: string;
    elements?: Array<{ objectId: string; text?: string }>;
  }>
): slides_v1.Schema$Presentation {
  return {
    presentationId: "pres1",
    slides: slides.map((s) => ({
      objectId: s.objectId,
      pageElements: (s.elements ?? []).map((e) => ({
        objectId: e.objectId,
        shape: e.text
          ? { text: { textElements: [{ textRun: { content: e.text } }] } }
          : undefined,
      })),
    })),
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

  describe("replaceTextInShape", () => {
    it("should emit a replaceAllText scoped to the slide", () => {
      const pres = makePresentation([
        {
          objectId: "slide_a",
          elements: [{ objectId: "el_1", text: "Hello" }],
        },
        {
          objectId: "slide_b",
          elements: [{ objectId: "el_2", text: "Hello" }],
        },
      ]);
      const res = resolvePresentationOperations(pres, [
        {
          type: "replaceTextInShape",
          slideNumber: 1,
          find: "Hello",
          replace: "Hi",
        },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const req = res.value[0].replaceAllText;
        expect(req?.pageObjectIds).toEqual(["slide_a"]);
        expect(req?.containsText?.text).toBe("Hello");
        expect(req?.replaceText).toBe("Hi");
      }
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

  describe("replaceAllText", () => {
    it("should not require any resolution", () => {
      const pres = makePresentation([]);
      const res = resolvePresentationOperations(pres, [
        { type: "replaceAllText", find: "foo", replace: "bar" },
      ]);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual([
          {
            replaceAllText: {
              containsText: { text: "foo", matchCase: false },
              replaceText: "bar",
            },
          },
        ]);
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
