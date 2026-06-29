import { parseAnthropicToolSearchBlock } from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import { describe, expect, it } from "vitest";

describe("parseAnthropicToolSearchBlock", () => {
  it("parses a server_tool_use block verbatim", () => {
    const block = {
      type: "server_tool_use",
      id: "srvtoolu_1",
      name: "tool_search_tool_bm25",
      input: { query: "create github issue" },
    };

    expect(parseAnthropicToolSearchBlock(block)).toEqual(block);
  });

  it("parses a tool_search_tool_result block verbatim", () => {
    const block = {
      type: "tool_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: {
        type: "tool_search_tool_search_result",
        tool_references: [
          { type: "tool_reference", tool_name: "github__create_issue" },
        ],
      },
    };

    expect(parseAnthropicToolSearchBlock(block)).toEqual(block);
  });

  it("parses a tool_search_tool_result error block", () => {
    const block = {
      type: "tool_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: {
        type: "tool_search_tool_result_error",
        error_code: "unavailable",
        error_message: "transient",
      },
    };

    expect(parseAnthropicToolSearchBlock(block)).toEqual(block);
  });

  it("returns null for an unrecognized or malformed block", () => {
    expect(parseAnthropicToolSearchBlock({ type: "text", text: "hi" })).toBe(
      null
    );
    expect(parseAnthropicToolSearchBlock({ type: "server_tool_use" })).toBe(
      null
    );
    expect(parseAnthropicToolSearchBlock(null)).toBe(null);
  });
});
