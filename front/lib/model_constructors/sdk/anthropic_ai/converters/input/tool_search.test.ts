import {
  includesToolSearchTool,
  TOOL_SEARCH_INSTRUCTION,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { toolSpecsToAnthropicAITools } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import type { ToolSpecification } from "@app/lib/model_constructors/types/input/configuration";
import { describe, expect, it } from "vitest";

const hot: ToolSpecification = {
  name: "hot",
  description: "A hot tool.",
  inputSchema: { type: "object", properties: {} },
};

const cold: ToolSpecification = {
  name: "cold",
  description: "A cold tool.",
  inputSchema: { type: "object", properties: {} },
  deferLoading: true,
};

// The new client appends the tool search instruction iff the search tool is in
// the request. The predicate reads the converted tools, so it stays in lockstep
// with toolSpecsToAnthropicAITools, including the force-call edge case.
describe("includesToolSearchTool", () => {
  it("is false when nothing is deferred", () => {
    expect(
      includesToolSearchTool(
        toolSpecsToAnthropicAITools([hot], { forceTool: undefined })
      )
    ).toBe(false);
  });

  it("is true when a deferred tool prepends the search tool", () => {
    expect(
      includesToolSearchTool(
        toolSpecsToAnthropicAITools([hot, cold], { forceTool: undefined })
      )
    ).toBe(true);
  });

  it("is false when the only deferred tool is force-called", () => {
    expect(
      includesToolSearchTool(
        toolSpecsToAnthropicAITools([cold], { forceTool: "cold" })
      )
    ).toBe(false);
  });
});

describe("TOOL_SEARCH_INSTRUCTION", () => {
  it("is a non-empty hint that does not name the underlying search tool", () => {
    expect(TOOL_SEARCH_INSTRUCTION.length).toBeGreaterThan(0);
    expect(TOOL_SEARCH_INSTRUCTION).not.toContain("bm25");
  });
});
