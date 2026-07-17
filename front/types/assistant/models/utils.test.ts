import { describe, expect, it } from "vitest";

import {
  GPT_5_5_MODEL_CONFIG,
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_5_6_TERRA_MODEL_CONFIG,
} from "./openai";
import { getModelMaxInputTokens, validateResponseFormat } from "./utils";

const VALID_RESPONSE_FORMAT = JSON.stringify({
  type: "json_schema",
  json_schema: {
    name: "TestSchema",
    strict: true,
    schema: {
      type: "object",
      properties: {
        foo: { type: "string" },
      },
      required: ["foo"],
      additionalProperties: false,
    },
  },
});

describe("getModelMaxInputTokens", () => {
  it.each([
    GPT_5_6_SOL_MODEL_CONFIG,
    GPT_5_6_TERRA_MODEL_CONFIG,
    GPT_5_6_LUNA_MODEL_CONFIG,
  ])("uses the $displayName context size as its input cap", (model) => {
    expect(getModelMaxInputTokens(model)).toBe(272_000);
  });

  it("keeps reserving output tokens for other models", () => {
    expect(getModelMaxInputTokens(GPT_5_5_MODEL_CONFIG)).toBe(872_000);
  });
});

describe("validateResponseFormat", () => {
  it("returns valid for a correct schema", () => {
    expect(validateResponseFormat(VALID_RESPONSE_FORMAT)).toEqual({
      isValid: true,
    });
  });

  it("returns an error for missing required field", () => {
    const input = JSON.stringify({ type: "json_schema" });
    const result = validateResponseFormat(input);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.errorMessage).toContain("Missing required field");
      expect(result.errorMessage).toContain("json_schema");
    }
  });

  it("returns an error for invalid field type", () => {
    const input = JSON.stringify({
      type: "json_schema",
      json_schema: {
        name: "TestSchema",
        schema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: "yes",
        },
      },
    });
    const result = validateResponseFormat(input);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.errorMessage).toContain("Expected boolean");
      expect(result.errorMessage).toContain("additionalProperties");
    }
  });

  it("returns an error for invalid JSON", () => {
    const result = validateResponseFormat("not json");

    expect(result).toEqual({
      isValid: false,
      errorMessage: "Invalid JSON.",
    });
  });
});
