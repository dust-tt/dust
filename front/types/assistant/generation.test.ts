import { describe, expect, it } from "vitest";

import type { ImageContent, TextContent } from "./generation";
import { isImageContent, isTextContent } from "./generation";

describe("Type Guards", () => {
  describe("isTextContent", () => {
    it("should return true for valid TextContent", () => {
      const content: TextContent = {
        type: "text",
        text: "Hello world",
      };
      expect(isTextContent(content)).toBe(true);
    });

    it("should return true for TextContent with empty text", () => {
      const content = {
        type: "text",
        text: "",
      };
      expect(isTextContent(content)).toBe(true);
    });

    it("should return false when type is missing", () => {
      const content = {
        text: "Hello world",
      };
      expect(isTextContent(content)).toBe(false);
    });

    it("should return false when text property is missing", () => {
      const content = {
        type: "text",
      };
      expect(isTextContent(content)).toBe(false);
    });

    it("should return false when type is not 'text'", () => {
      const content = {
        type: "image_url",
        text: "Hello world",
      };
      expect(isTextContent(content)).toBe(false);
    });

    it("should return false for empty object", () => {
      const content = {};
      expect(isTextContent(content)).toBe(false);
    });

    it("should return false for ImageContent", () => {
      const content: ImageContent = {
        type: "image_url",
        image_url: {
          url: "https://example.com/image.png",
        },
      };
      expect(isTextContent(content)).toBe(false);
    });

    it("should handle objects with null values", () => {
      const content = {
        type: "text",
        text: null,
      };
      expect(isTextContent(content)).toBe(false);
    });

    it("should handle objects with undefined values", () => {
      const content = {
        type: "text",
        text: undefined,
      };
      expect(isTextContent(content)).toBe(false);
    });
  });

  describe("isImageContent", () => {
    it("should return true for valid ImageContent", () => {
      const content: ImageContent = {
        type: "image_url",
        image_url: {
          url: "https://example.com/image.png",
        },
      };
      expect(isImageContent(content)).toBe(true);
    });

    it("should return true for ImageContent with empty url", () => {
      const content = {
        type: "image_url",
        image_url: {
          url: "",
        },
      };
      expect(isImageContent(content)).toBe(true);
    });

    it("should return false when type is missing", () => {
      const content = {
        image_url: {
          url: "https://example.com/image.png",
        },
      };
      expect(isImageContent(content)).toBe(false);
    });

    it("should return false when image_url property is missing", () => {
      const content = {
        type: "image_url",
      };
      expect(isImageContent(content)).toBe(false);
    });

    it("should return false when type is not 'image_url'", () => {
      const content = {
        type: "text",
        image_url: {
          url: "https://example.com/image.png",
        },
      };
      expect(isImageContent(content)).toBe(false);
    });

    it("should return false for empty object", () => {
      const content = {};
      expect(isImageContent(content)).toBe(false);
    });

    it("should return false for TextContent", () => {
      const content: TextContent = {
        type: "text",
        text: "Hello world",
      };
      expect(isImageContent(content)).toBe(false);
    });

    it("should handle objects with null values", () => {
      const content = {
        type: "image_url",
        image_url: null,
      };
      expect(isImageContent(content)).toBe(false);
      const content2 = {
        type: "image_url",
        image_url: {
          url: null,
        },
      };
      expect(isImageContent(content2)).toBe(false);
    });

    it("should handle objects with undefined values", () => {
      const content = {
        type: "image_url",
        image_url: undefined,
      };
      expect(isImageContent(content)).toBe(false);

      const content2 = {
        type: "image_url",
        image_url: {
          url: undefined,
        },
      };
      expect(isImageContent(content2)).toBe(false);
    });

    it("should return false if image_url structure is incomplete", () => {
      const content = {
        type: "image_url",
        image_url: {},
      };
      expect(isImageContent(content)).toBe(false);
    });
  });
});
