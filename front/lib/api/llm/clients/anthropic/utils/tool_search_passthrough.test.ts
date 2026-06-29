import type {
  ServerToolUseBlockParam,
  ToolSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { AnthropicToolSearchBlock } from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import { parseAnthropicToolSearchBlock } from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import { describe, expect, expectTypeOf, it } from "vitest";

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

describe("schema matches the Anthropic SDK param types", () => {
  // Compile-time guard against SDK drift: each zod-inferred block must stay
  // assignable to its SDK param. A newly required SDK field, a renamed field, or
  // a changed enum value breaks these (tsgo type-checks test files). It is
  // assignability, not equality, on purpose: we omit the optional caller /
  // cache_control fields the params allow, and treat `input` as present (the
  // param requires it where z.unknown() infers it optional), matching how
  // parseAnthropicToolSearchBlock reconstructs the block.
  it("keeps server_tool_use assignable to ServerToolUseBlockParam", () => {
    expectTypeOf<
      Extract<AnthropicToolSearchBlock, { type: "server_tool_use" }> & {
        input: unknown;
      }
    >().toMatchTypeOf<ServerToolUseBlockParam>();
  });

  it("keeps tool_search_tool_result assignable to ToolSearchToolResultBlockParam", () => {
    expectTypeOf<
      Extract<AnthropicToolSearchBlock, { type: "tool_search_tool_result" }>
    >().toMatchTypeOf<ToolSearchToolResultBlockParam>();
  });
});
