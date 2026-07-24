import {
  includesOpenAIToolSearchTool,
  OPENAI_TOOL_SEARCH_TOOL,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search";
import { describe, expect, it } from "vitest";

describe("includesOpenAIToolSearchTool", () => {
  it("is true when tool search is in the request", () => {
    expect(includesOpenAIToolSearchTool([OPENAI_TOOL_SEARCH_TOOL])).toBe(true);
  });

  it("is false when tool search is not in the request", () => {
    expect(includesOpenAIToolSearchTool([{ type: "function" }])).toBe(false);
  });
});
