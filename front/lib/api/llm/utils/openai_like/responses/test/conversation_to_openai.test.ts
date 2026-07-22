import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { StructuredSystemPrompt } from "@app/lib/api/llm/types/options";
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

    it("does not add cache breakpoints to following messages", () => {
      const messages = toInput(
        "You are a helpful assistant.",
        {
          messages: [
            {
              role: "user",
              name: "system",
              content: [{ type: "text", text: "Available skills" }],
            },
            ...conversationMessages,
          ],
        },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      for (const message of messages.slice(2)) {
        if ("content" in message && Array.isArray(message.content)) {
          for (const block of message.content) {
            expect(block).not.toHaveProperty("prompt_cache_breakpoint");
          }
        }
      }
    });
  });

  describe("system prompt", () => {
    const prompt: StructuredSystemPrompt = {
      instructions: [{ role: "instruction", content: "Instructions" }],
      sharedContext: [{ role: "context", content: "Shared context" }],
      ephemeralContext: [{ role: "context", content: "Ephemeral context" }],
    };

    it("adds cache breakpoints after stable system prompt tiers", () => {
      const messages = toInput(prompt, { messages: [] }, "developer", {
        cacheBreakpointsOnSystemPrompt: true,
      });

      expect(messages).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Instructions",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Shared context",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [{ type: "input_text", text: "Ephemeral context" }],
        },
      ]);
    });

    it("joins sections within each tier before placing its breakpoint", () => {
      const messages = toInput(
        {
          instructions: [
            { role: "instruction", content: " First instruction " },
            { role: "instruction", content: "Second instruction" },
          ],
          sharedContext: [
            { role: "context", content: "Shared context A" },
            { role: "context", content: "Shared context B" },
          ],
          ephemeralContext: [{ role: "context", content: "Ephemeral context" }],
        },
        { messages: [] },
        "developer",
        { cacheBreakpointsOnSystemPrompt: true }
      );

      expect(messages).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "First instruction\nSecond instruction",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Shared context A\nShared context B",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [{ type: "input_text", text: "Ephemeral context" }],
        },
      ]);
    });

    it("skips empty tiers without moving a breakpoint to ephemeral context", () => {
      const messages = toInput(
        {
          instructions: [{ role: "instruction", content: "  " }],
          sharedContext: [{ role: "context", content: "Shared context" }],
          ephemeralContext: [{ role: "context", content: "Ephemeral context" }],
        },
        { messages: [] },
        "developer",
        { cacheBreakpointsOnSystemPrompt: true }
      );

      expect(messages).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Shared context",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [{ type: "input_text", text: "Ephemeral context" }],
        },
      ]);
    });

    it("treats a string prompt as one cacheable shared-context tier", () => {
      expect(
        toInput("Shared context", { messages: [] }, "developer", {
          cacheBreakpointsOnSystemPrompt: true,
        })
      ).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Shared context",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
      ]);
    });

    it("preserves an empty system prompt without adding a breakpoint", () => {
      expect(
        toInput(
          {
            instructions: [],
            sharedContext: [],
            ephemeralContext: [],
          },
          { messages: [] },
          "developer",
          { cacheBreakpointsOnSystemPrompt: true }
        )
      ).toEqual([
        {
          role: "developer",
          content: [{ type: "input_text", text: "" }],
        },
      ]);
    });

    it("uses exactly the Anthropic-equivalent explicit breakpoints", () => {
      const messages = toInput(
        prompt,
        {
          messages: [
            {
              role: "user",
              name: "system",
              content: [{ type: "text", text: "Equipped skills" }],
            },
            {
              role: "user",
              name: "user",
              content: [{ type: "text", text: "Current request" }],
            },
          ],
        },
        "developer",
        {
          cacheBreakpointsOnSystemPrompt: true,
          cacheBreakpointOnLeadingMessage: true,
        }
      );

      expect(messages).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Instructions",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Shared context",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "developer",
          content: [{ type: "input_text", text: "Ephemeral context" }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Equipped skills",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "Current request" }],
        },
      ]);
    });

    it("keeps system tiers unmarked when only skills caching is enabled", () => {
      const messages = toInput(
        prompt,
        {
          messages: [
            {
              role: "user",
              name: "system",
              content: [{ type: "text", text: "Equipped skills" }],
            },
          ],
        },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      expect(messages).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Instructions\nShared context\nEphemeral context",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Equipped skills",
              prompt_cache_breakpoint: { mode: "explicit" },
            },
          ],
        },
      ]);
    });

    it("keeps the flattened system prompt without explicit caching", () => {
      expect(toInput(prompt, { messages: [] })).toEqual([
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Instructions\nShared context\nEphemeral context",
            },
          ],
        },
      ]);
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
