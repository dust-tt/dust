import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  parseAnthropicServerToolBlock,
  stripUnreplayableServerToolBlocks,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/server_tool_passthrough";
import logger from "@app/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webSearchUse = {
  type: "server_tool_use" as const,
  id: "srvtoolu_web",
  name: "web_search" as const,
  input: { query: "q" },
};

const webSearchResult = {
  type: "web_search_tool_result" as const,
  tool_use_id: "srvtoolu_web",
  content: [
    {
      type: "web_search_result" as const,
      url: "https://example.com",
      title: "T",
      encrypted_content: "opaque",
    },
  ],
};

const toolSearchUse = {
  type: "server_tool_use" as const,
  id: "srvtoolu_search",
  name: "tool_search_tool_bm25" as const,
  input: { query: "q" },
};

const toolSearchResult = {
  type: "tool_search_tool_result" as const,
  tool_use_id: "srvtoolu_search",
  content: {
    type: "tool_search_tool_search_result" as const,
    tool_references: [{ type: "tool_reference" as const, tool_name: "a_tool" }],
  },
};

describe("parseAnthropicServerToolBlock", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes a tool-search block to its parser", () => {
    expect(parseAnthropicServerToolBlock(toolSearchResult)).toEqual(
      toolSearchResult
    );
  });

  it("routes a web-search block to its parser", () => {
    expect(parseAnthropicServerToolBlock(webSearchResult)).toEqual(
      webSearchResult
    );
  });

  // Regression guard: before the dispatcher existed, a valid web-search block
  // was rejected by the tool-search parser and logged as unparseable.
  it("does not warn for a valid block of either family", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    parseAnthropicServerToolBlock(toolSearchUse);
    parseAnthropicServerToolBlock(webSearchUse);

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns exactly once and returns null for an unknown block", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    expect(parseAnthropicServerToolBlock({ type: "nonsense" })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("stripUnreplayableServerToolBlocks", () => {
  it("keeps both families when both tools are in the request", () => {
    const messages: MessageParam[] = [
      {
        role: "assistant",
        content: [
          toolSearchUse,
          toolSearchResult,
          webSearchUse,
          webSearchResult,
        ],
      },
    ];

    expect(
      stripUnreplayableServerToolBlocks(messages, {
        toolSearchInRequest: true,
        nativeWebSearchInRequest: true,
      })
    ).toBe(messages);
  });

  // The last step and auxiliary calls (title generation) carry neither tool.
  it("strips both families when neither tool is in the request", () => {
    const messages: MessageParam[] = [
      {
        role: "assistant",
        content: [
          toolSearchUse,
          toolSearchResult,
          webSearchUse,
          webSearchResult,
          { type: "text", text: "answer" },
        ],
      },
    ];

    expect(
      stripUnreplayableServerToolBlocks(messages, {
        toolSearchInRequest: false,
        nativeWebSearchInRequest: false,
      })
    ).toEqual([
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
    ]);
  });

  it("strips only web search when only tool search is in the request", () => {
    const messages: MessageParam[] = [
      {
        role: "assistant",
        content: [
          toolSearchUse,
          toolSearchResult,
          webSearchUse,
          webSearchResult,
        ],
      },
    ];

    expect(
      stripUnreplayableServerToolBlocks(messages, {
        toolSearchInRequest: true,
        nativeWebSearchInRequest: false,
      })
    ).toEqual([
      { role: "assistant", content: [toolSearchUse, toolSearchResult] },
    ]);
  });
});
