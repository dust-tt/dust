import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResultWithStructuredContent } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { withToolResultProcessing } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { Err, Ok } from "@app/types/shared/result";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

// Extra fields beyond the SDK resource type are allowed at runtime (passthrough) but not in the
// inline literal type — build the resource separately to skip excess property checking.
const resourceWithExtraField = {
  uri: "test://resource",
  mimeType: "text/plain",
  text: "resource text",
  extraField: "extra value",
};

const resourceContent: CallToolResult["content"] = [
  { type: "resource", resource: resourceWithExtraField },
  { type: "text", text: "plain text" },
];

function expectExtraFieldMovedToMeta(content: CallToolResult["content"]) {
  const [resourceItem, textItem] = content;
  if (resourceItem.type !== "resource") {
    throw new Error("Expected a resource item.");
  }
  expect(resourceItem.resource._meta).toEqual({ extraField: "extra value" });
  expect(textItem).toEqual({ type: "text", text: "plain text" });
}

describe("withToolResultProcessing", () => {
  it("moves extra resource fields to _meta for bare content arrays", async () => {
    const result = await withToolResultProcessing(
      Promise.resolve<ToolHandlerResultWithStructuredContent>(
        new Ok(resourceContent)
      )
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(Array.isArray(result.value)).toBe(true);
      if (Array.isArray(result.value)) {
        expectExtraFieldMovedToMeta(result.value);
      }
    }
  });

  it("processes content and preserves structuredContent for structured outputs", async () => {
    const structuredContent = { items: [{ id: 1 }], nextCursor: "abc" };
    const result = await withToolResultProcessing(
      Promise.resolve<ToolHandlerResultWithStructuredContent>(
        new Ok({ content: resourceContent, structuredContent })
      )
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(Array.isArray(result.value)).toBe(false);
      if (!Array.isArray(result.value)) {
        expectExtraFieldMovedToMeta(result.value.content);
        expect(result.value.structuredContent).toEqual(structuredContent);
      }
    }
  });

  it("passes errors through unchanged", async () => {
    const error = new MCPError("boom");
    const result = await withToolResultProcessing(
      Promise.resolve<ToolHandlerResultWithStructuredContent>(new Err(error))
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });
});
