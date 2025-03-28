import { describe, expect, it } from "vitest";

import type { DustAppRunInputType, InputSchemaType } from "./agent";
import {
  dustAppRunInputsToInputSchema,
  inputSchemaToDustAppRunInputs,
} from "./agent";

describe("Agent Type Utilities", () => {
  describe("dustAppRunInputsToInputSchema", () => {
    it("should convert basic inputs to schema", () => {
      const inputs: DustAppRunInputType[] = [
        {
          name: "query",
          type: "string",
          description: "Search query",
        },
        {
          name: "count",
          type: "number",
          description: "Number of results",
        },
      ];

      const expected: InputSchemaType = {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          count: {
            type: "number",
            description: "Number of results",
          },
        },
        required: ["query", "count"],
      };

      expect(dustAppRunInputsToInputSchema(inputs)).toEqual(expected);
    });

    it("should handle array type inputs", () => {
      const inputs: DustAppRunInputType[] = [
        {
          name: "tags",
          type: "array",
          description: "List of tags",
          items: {
            type: "string",
          },
        },
      ];

      const expected: InputSchemaType = {
        type: "object",
        properties: {
          tags: {
            type: "array",
            description: "List of tags",
            items: {
              type: "string",
            },
          },
        },
        required: ["tags"],
      };

      expect(dustAppRunInputsToInputSchema(inputs)).toEqual(expected);
    });
  });

  describe("inputSchemaToDustAppRunInputs", () => {
    it("should convert schema to basic inputs", () => {
      const schema: InputSchemaType = {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          count: {
            type: "number",
            description: "Number of results",
          },
        },
        required: ["query", "count"],
      };

      const expected: DustAppRunInputType[] = [
        {
          name: "query",
          type: "string",
          description: "Search query",
        },
        {
          name: "count",
          type: "number",
          description: "Number of results",
        },
      ];

      expect(inputSchemaToDustAppRunInputs(schema)).toEqual(expected);
    });

    it("should handle array type properties", () => {
      const schema: InputSchemaType = {
        type: "object",
        properties: {
          tags: {
            type: "array",
            description: "List of tags",
            items: {
              type: "string",
            },
          },
        },
        required: ["tags"],
      };

      const expected: DustAppRunInputType[] = [
        {
          name: "tags",
          type: "array",
          description: "List of tags",
        },
      ];

      expect(inputSchemaToDustAppRunInputs(schema)).toEqual(expected);
    });

    it("should handle missing or invalid properties", () => {
      const schema: InputSchemaType = {
        type: "object",
        properties: {
          valid: {
            type: "string",
            description: "Valid property",
          },
          invalid: null,
          missingType: {
            description: "Missing type",
          },
        },
        required: ["valid", "invalid", "missingType"],
      };

      const expected: DustAppRunInputType[] = [
        {
          name: "valid",
          type: "string",
          description: "Valid property",
        },
        {
          name: "invalid",
          type: "string",
          description: "",
        },
        {
          name: "missingType",
          type: "string",
          description: "Missing type",
        },
      ];

      expect(inputSchemaToDustAppRunInputs(schema)).toEqual(expected);
    });

    it("should handle empty properties object", () => {
      const schema: InputSchemaType = {
        type: "object",
        properties: {},
        required: [],
      };

      expect(inputSchemaToDustAppRunInputs(schema)).toEqual([]);
    });
  });
});
