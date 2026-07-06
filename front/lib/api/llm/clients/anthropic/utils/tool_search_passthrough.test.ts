import type {
  ContentBlockParam,
  MessageParam,
  ServerToolUseBlockParam,
  ToolSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { AnthropicToolSearchBlock } from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import {
  parseAnthropicToolSearchBlock,
  stripUnreplayableToolSearchBlocks,
} from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
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

// -- stripUnreplayableToolSearchBlocks fixtures --

function search(id: string): ContentBlockParam {
  return {
    type: "server_tool_use",
    id,
    name: "tool_search_tool_bm25",
    input: { query: "calendar" },
  };
}

function searchResult(id: string): ContentBlockParam {
  return {
    type: "tool_search_tool_result",
    tool_use_id: id,
    content: {
      type: "tool_search_tool_search_result",
      tool_references: [{ type: "tool_reference", tool_name: "list_events" }],
    },
  };
}

function thinking(): ContentBlockParam {
  return { type: "thinking", thinking: "reasoning", signature: "sig" };
}

function text(value: string): ContentBlockParam {
  return { type: "text", text: value };
}

function toolUse(id: string): ContentBlockParam {
  return { type: "tool_use", id, name: "enable_skill", input: {} };
}

function toolResult(id: string): ContentBlockParam {
  return {
    type: "tool_result",
    tool_use_id: id,
    content: [{ type: "text", text: "Skill enabled." }],
  };
}

function assistant(...content: ContentBlockParam[]): MessageParam {
  return { role: "assistant", content };
}

function user(...content: ContentBlockParam[]): MessageParam {
  return { role: "user", content };
}

function blockTypes(message: MessageParam): string[] {
  if (typeof message.content === "string") {
    throw new Error("expected block content");
  }
  return message.content.map((block) => block.type);
}

describe("stripUnreplayableToolSearchBlocks", () => {
  it("returns the input array untouched when every block is replayable", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(search("srv_1"), searchResult("srv_1"), toolUse("tool_1")),
      user(toolResult("tool_1")),
    ];

    expect(
      stripUnreplayableToolSearchBlocks(messages, { toolSearchInRequest: true })
    ).toBe(messages);
  });

  it("keeps a dangling search on the final assistant message when the continuation is exclusively tool_result blocks", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(thinking(), search("srv_1"), toolUse("tool_1")),
      user(toolResult("tool_1")),
    ];

    expect(
      stripUnreplayableToolSearchBlocks(messages, { toolSearchInRequest: true })
    ).toBe(messages);
  });

  it("strips a dangling search when the continuation carries a non tool_result block", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(thinking(), search("srv_1"), toolUse("tool_1")),
      user(
        toolResult("tool_1"),
        text("<dust_system>skill instructions</dust_system>")
      ),
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(messages, {
      toolSearchInRequest: true,
    });

    expect(blockTypes(sanitized[1])).toEqual(["thinking", "tool_use"]);
    expect(blockTypes(sanitized[2])).toEqual(["tool_result", "text"]);
  });

  it("strips a dangling search sitting in the middle of the history", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(search("srv_1"), toolUse("tool_1")),
      user(toolResult("tool_1")),
      assistant(text("Done.")),
      user(text("Thanks, now summarize.")),
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(messages, {
      toolSearchInRequest: true,
    });

    expect(blockTypes(sanitized[1])).toEqual(["tool_use"]);
  });

  it("keeps completed pairs verbatim while stripping the dangling sibling", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(
        search("srv_1"),
        searchResult("srv_1"),
        search("srv_2"),
        toolUse("tool_1")
      ),
      user(toolResult("tool_1"), text("steering text")),
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(messages, {
      toolSearchInRequest: true,
    });

    expect(blockTypes(sanitized[1])).toEqual([
      "server_tool_use",
      "tool_search_tool_result",
      "tool_use",
    ]);
  });

  it("strips every tool search block when the request has no tool search tool", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(
        text("Searching."),
        search("srv_1"),
        searchResult("srv_1"),
        toolUse("tool_1")
      ),
      user(toolResult("tool_1")),
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(messages, {
      toolSearchInRequest: false,
    });

    expect(blockTypes(sanitized[1])).toEqual(["text", "tool_use"]);
  });

  it("drops a message emptied by stripping and merges its same-role neighbors", () => {
    const messages = [
      user(text("Find my meetings.")),
      assistant(search("srv_1"), searchResult("srv_1")),
      user(text("Thanks, now summarize.")),
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(messages, {
      toolSearchInRequest: false,
    });

    expect(sanitized.map((m) => m.role)).toEqual(["user"]);
    expect(blockTypes(sanitized[0])).toEqual(["text", "text"]);
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
