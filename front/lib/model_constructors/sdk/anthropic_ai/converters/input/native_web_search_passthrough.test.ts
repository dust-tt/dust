import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  parseAnthropicWebSearchBlock,
  stripWebSearchBlocks,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/native_web_search_passthrough";
import { describe, expect, it } from "vitest";

const serverToolUse = {
  type: "server_tool_use" as const,
  id: "srvtoolu_1",
  name: "web_search" as const,
  input: { query: "who won the last world cup" },
};

const toolResult = {
  type: "web_search_tool_result" as const,
  tool_use_id: "srvtoolu_1",
  content: [
    {
      type: "web_search_result" as const,
      url: "https://example.com/wc",
      title: "World Cup",
      encrypted_content: "opaque",
      page_age: "2 days ago",
    },
  ],
};

describe("parseAnthropicWebSearchBlock", () => {
  it("round-trips a web search server_tool_use", () => {
    expect(parseAnthropicWebSearchBlock(serverToolUse)).toEqual(serverToolUse);
  });

  it("round-trips a results block", () => {
    expect(parseAnthropicWebSearchBlock(toolResult)).toEqual(toolResult);
  });

  // `page_age` is nullable on the wire but optional on the param type, so a null
  // must not be replayed as an explicit null.
  it("drops a null page_age rather than replaying it", () => {
    const parsed = parseAnthropicWebSearchBlock({
      ...toolResult,
      content: [{ ...toolResult.content[0], page_age: null }],
    });

    expect(parsed).toEqual({
      ...toolResult,
      content: [
        {
          type: "web_search_result",
          url: "https://example.com/wc",
          title: "World Cup",
          encrypted_content: "opaque",
        },
      ],
    });
  });

  it("round-trips an error result", () => {
    const errorResult = {
      type: "web_search_tool_result" as const,
      tool_use_id: "srvtoolu_1",
      content: {
        type: "web_search_tool_result_error" as const,
        error_code: "max_uses_exceeded" as const,
      },
    };

    expect(parseAnthropicWebSearchBlock(errorResult)).toEqual(errorResult);
  });

  // The two families must stay separate: their error vocabularies differ.
  it("rejects a tool-search block", () => {
    expect(
      parseAnthropicWebSearchBlock({
        type: "server_tool_use",
        id: "srvtoolu_2",
        name: "tool_search_tool_bm25",
        input: {},
      })
    ).toBeNull();
  });

  it("rejects an unknown block", () => {
    expect(parseAnthropicWebSearchBlock({ type: "nonsense" })).toBeNull();
  });
});

describe("stripWebSearchBlocks", () => {
  it("returns the same array when there is nothing to strip", () => {
    const messages: MessageParam[] = [
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ];

    // Identity, not just equality: the common path must stay byte-identical for
    // prompt caching.
    expect(stripWebSearchBlocks(messages)).toBe(messages);
  });

  it("strips the use and result pair together, keeping the rest", () => {
    const messages: MessageParam[] = [
      {
        role: "assistant",
        content: [serverToolUse, toolResult, { type: "text", text: "answer" }],
      },
    ];

    expect(stripWebSearchBlocks(messages)).toEqual([
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
    ]);
  });

  it("leaves tool-search blocks alone", () => {
    const toolSearchUse = {
      type: "server_tool_use" as const,
      id: "srvtoolu_2",
      name: "tool_search_tool_bm25" as const,
      input: {},
    };
    const messages: MessageParam[] = [
      { role: "assistant", content: [toolSearchUse, serverToolUse] },
    ];

    expect(stripWebSearchBlocks(messages)).toEqual([
      { role: "assistant", content: [toolSearchUse] },
    ]);
  });

  // Anthropic rejects consecutive same-role messages, so dropping a message
  // whole has to re-merge its neighbours.
  it("drops an emptied message and re-merges same-role neighbours", () => {
    const messages: MessageParam[] = [
      { role: "assistant", content: [{ type: "text", text: "before" }] },
      { role: "assistant", content: [serverToolUse, toolResult] },
      { role: "assistant", content: [{ type: "text", text: "after" }] },
    ];

    expect(stripWebSearchBlocks(messages)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "before" },
          { type: "text", text: "after" },
        ],
      },
    ]);
  });

  it("never touches user messages", () => {
    const messages: MessageParam[] = [
      { role: "user", content: [{ type: "text", text: "q" }] },
      { role: "assistant", content: [serverToolUse, toolResult] },
    ];

    expect(stripWebSearchBlocks(messages)).toEqual([
      { role: "user", content: [{ type: "text", text: "q" }] },
    ]);
  });
});
