import { describe, expect, it } from "vitest";

import { parseLlmReasoningMetadata } from "./index";

describe("parseLlmReasoningMetadata", () => {
  it("should parse valid reasoning metadata with id and encrypted_content", () => {
    const metadata = JSON.stringify({
      id: "test-id-123",
      encrypted_content: "encrypted-data-xyz",
    });

    const result = parseLlmReasoningMetadata(metadata);

    expect(result).toEqual({
      id: "test-id-123",
      encrypted_content: "encrypted-data-xyz",
    });
  });
  it("should parse valid reasoning metadata without id", () => {
    const metadata = JSON.stringify({
      encrypted_content: "encrypted-data-xyz",
    });

    const result = parseLlmReasoningMetadata(metadata);

    expect(result).toEqual({
      id: undefined,
      encrypted_content: "encrypted-data-xyz",
    });
  });
  it("should parse empty metadata to undefined id and encrypted_content", () => {
    const result = parseLlmReasoningMetadata("");

    expect(result).toEqual({
      id: undefined,
      encrypted_content: undefined,
    });
  });
});
