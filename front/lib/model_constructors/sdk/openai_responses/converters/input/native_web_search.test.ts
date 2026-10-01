import {
  includesOpenAIWebSearchTool,
  OPENAI_WEB_SEARCH_TOOL,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/native_web_search";
import { OPENAI_TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search";
import { toolSpecsToOpenAITools } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { ToolSpecification } from "@app/lib/model_constructors/types/input/configuration";
import { describe, expect, it } from "vitest";

const eagerTool: ToolSpecification = {
  name: "eager",
  description: "An eager tool.",
  inputSchema: { type: "object", properties: {} },
  eager: true,
};

const deferrableTool: ToolSpecification = {
  name: "deferrable",
  description: "A deferrable tool.",
  inputSchema: { type: "object", properties: {} },
};

describe("toolSpecsToOpenAITools with native web search", () => {
  it("prepends the web search tool when enabled", () => {
    const tools = toolSpecsToOpenAITools([eagerTool], {
      forceTool: undefined,
      toolSearchEnabled: false,
      nativeWebSearchEnabled: true,
    });

    expect(tools[0]).toEqual(OPENAI_WEB_SEARCH_TOOL);
    expect(includesOpenAIWebSearchTool(tools)).toBe(true);
  });

  it("omits the web search tool when disabled", () => {
    const tools = toolSpecsToOpenAITools([eagerTool], {
      forceTool: undefined,
      toolSearchEnabled: false,
      nativeWebSearchEnabled: false,
    });

    expect(includesOpenAIWebSearchTool(tools)).toBe(false);
  });

  it("omits the web search tool when a tool is force-called", () => {
    const tools = toolSpecsToOpenAITools([eagerTool], {
      forceTool: "eager",
      toolSearchEnabled: false,
      nativeWebSearchEnabled: true,
    });

    expect(includesOpenAIWebSearchTool(tools)).toBe(false);
  });

  it("orders tool search before web search before function tools", () => {
    const tools = toolSpecsToOpenAITools([deferrableTool], {
      forceTool: undefined,
      toolSearchEnabled: true,
      nativeWebSearchEnabled: true,
    });

    expect(tools).toHaveLength(3);
    expect(tools[0]).toEqual(OPENAI_TOOL_SEARCH_TOOL);
    expect(tools[1]).toEqual(OPENAI_WEB_SEARCH_TOOL);
    expect(tools[2]).toMatchObject({ name: "deferrable" });
  });
});

describe("includesOpenAIWebSearchTool", () => {
  it("is false for an unrelated tool", () => {
    expect(includesOpenAIWebSearchTool([{ type: "function" }])).toBe(false);
  });
});
