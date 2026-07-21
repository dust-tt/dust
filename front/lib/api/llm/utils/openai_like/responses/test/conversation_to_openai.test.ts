import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  toInput,
  toToolsParam,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { conversationMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/conversation_messages";
import { inputMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_input";
import { describe, expect, it } from "vitest";

describe("toInput", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const prompt = "You are a helpful assistant.";
      const messages = toInput(prompt, { messages: conversationMessages });

      expect(messages).toEqual(inputMessages);
    });

    it("adds a cache breakpoint to the leading equipped-skills message", () => {
      const messages = toInput(
        "You are a helpful assistant.",
        {
          messages: [
            {
              role: "user",
              name: "system",
              content: [
                { type: "text", text: "Available" },
                { type: "text", text: "skills" },
              ],
            },
            ...conversationMessages,
          ],
        },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      expect(messages[1]).toEqual({
        role: "user",
        content: [
          { type: "input_text", text: "Available" },
          {
            type: "input_text",
            text: "skills",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      });
    });

    it("does not add a cache breakpoint to a regular leading user message", () => {
      const messages = toInput(
        "You are a helpful assistant.",
        { messages: conversationMessages },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      expect(messages).toEqual(inputMessages);
    });

    it("does not add a cache breakpoint to a non-leading skills message", () => {
      const messages = toInput(
        "You are a helpful assistant.",
        {
          messages: [
            ...conversationMessages,
            {
              role: "user",
              name: "system",
              content: [{ type: "text", text: "Available skills" }],
            },
          ],
        },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      expect(messages.at(-1)).toEqual({
        role: "user",
        content: [{ type: "input_text", text: "Available skills" }],
      });
    });
  });

  it("replays OpenAI tool-search items and skips other providers", () => {
    const toolSearchCall = {
      type: "tool_search_call" as const,
      id: "ts_123",
      call_id: null,
      execution: "server" as const,
      status: "completed" as const,
      arguments: { paths: ["weather"] },
      created_by: "openai",
    };

    const messages = toInput("prompt", {
      messages: [
        {
          role: "assistant",
          name: "agent",
          contents: [
            {
              type: "provider_passthrough",
              value: { provider: "openai", block: toolSearchCall },
            },
            {
              type: "provider_passthrough",
              value: { provider: "anthropic", block: toolSearchCall },
            },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        role: "developer",
        content: [{ type: "input_text", text: "prompt" }],
      },
      toolSearchCall,
    ]);
  });

  it("replays a discovered function call with its namespace", () => {
    const messages = toInput("prompt", {
      messages: [
        {
          role: "assistant",
          name: "agent",
          contents: [
            {
              type: "function_call",
              value: {
                id: "call_123",
                name: "get_weather",
                arguments: "{}",
                namespace: "weather",
              },
            },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        role: "developer",
        content: [{ type: "input_text", text: "prompt" }],
      },
      {
        type: "function_call",
        call_id: "call_123",
        name: "get_weather",
        arguments: "{}",
        namespace: "weather",
      },
    ]);
  });
});

describe("toToolsParam", () => {
  const eagerTool: AgentActionSpecification = {
    name: "get_time",
    description: "Get the current time",
    inputSchema: { type: "object", properties: {} },
    eager: true,
  };
  const deferredTool: AgentActionSpecification = {
    name: "get_weather",
    description: "Get the current weather",
    inputSchema: { type: "object", properties: {} },
  };

  it("prepends tool search and defers non-eager functions", () => {
    expect(
      toToolsParam([eagerTool, deferredTool], {
        forceToolCall: undefined,
        toolSearchEnabled: true,
      })
    ).toEqual([
      { type: "tool_search" },
      expect.objectContaining({ name: "get_time" }),
      expect.objectContaining({
        name: "get_weather",
        defer_loading: true,
      }),
    ]);
  });

  it("keeps a forced function eager", () => {
    const tools = toToolsParam([deferredTool], {
      forceToolCall: deferredTool.name,
      toolSearchEnabled: true,
    });

    expect(tools).toEqual([expect.objectContaining({ name: "get_weather" })]);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });

  it("does not defer functions when tool search is disabled", () => {
    const tools = toToolsParam([deferredTool], {
      forceToolCall: undefined,
      toolSearchEnabled: false,
    });

    expect(tools).toEqual([expect.objectContaining({ name: "get_weather" })]);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });
});
