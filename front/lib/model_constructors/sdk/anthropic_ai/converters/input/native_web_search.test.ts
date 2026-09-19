import {
  ANTHROPIC_WEB_SEARCH_TOOL,
  includesAnthropicWebSearchTool,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/native_web_search";
import { TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { toolSpecsToAnthropicAITools } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
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

describe("toolSpecsToAnthropicAITools with native web search", () => {
  it("prepends the web search tool when enabled", () => {
    const tools = toolSpecsToAnthropicAITools([eagerTool], {
      forceTool: undefined,
      toolSearchEnabled: false,
      nativeWebSearchEnabled: true,
    });

    expect(tools[0]).toEqual(ANTHROPIC_WEB_SEARCH_TOOL);
    expect(includesAnthropicWebSearchTool(tools)).toBe(true);
  });

  it("omits the web search tool when disabled", () => {
    const tools = toolSpecsToAnthropicAITools([eagerTool], {
      forceTool: undefined,
      toolSearchEnabled: false,
      nativeWebSearchEnabled: false,
    });

    expect(includesAnthropicWebSearchTool(tools)).toBe(false);
  });

  // A server tool cannot be a tool_choice target, and its interaction with a
  // non-auto tool_choice is unspecified, so force-called requests stay clean.
  it("omits the web search tool when a tool is force-called", () => {
    const tools = toolSpecsToAnthropicAITools([eagerTool], {
      forceTool: "eager",
      toolSearchEnabled: false,
      nativeWebSearchEnabled: true,
    });

    expect(includesAnthropicWebSearchTool(tools)).toBe(false);
  });

  // Order is fixed so the serialized tools prefix stays byte-stable for prompt
  // caching across steps.
  it("orders tool search before web search before function tools", () => {
    const tools = toolSpecsToAnthropicAITools([deferrableTool], {
      forceTool: undefined,
      toolSearchEnabled: true,
      nativeWebSearchEnabled: true,
    });

    expect(tools).toHaveLength(3);
    expect(tools[0]).toEqual(TOOL_SEARCH_TOOL);
    expect(tools[1]).toEqual(ANTHROPIC_WEB_SEARCH_TOOL);
    expect(tools[2]).toMatchObject({ name: "deferrable" });
  });

  // The tool replaces one the model previously always saw, so it must never be
  // something the model has to discover through tool search first.
  it("never defers the web search tool", () => {
    const tools = toolSpecsToAnthropicAITools([deferrableTool], {
      forceTool: undefined,
      toolSearchEnabled: true,
      nativeWebSearchEnabled: true,
    });

    expect(tools[1]).not.toHaveProperty("defer_loading");
  });
});

describe("includesAnthropicWebSearchTool", () => {
  it("is false for an unrelated tool", () => {
    expect(includesAnthropicWebSearchTool([{ type: "custom" }])).toBe(false);
  });
});
