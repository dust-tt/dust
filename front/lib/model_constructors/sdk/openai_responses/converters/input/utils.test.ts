import {
  assistantProviderPassthroughMessageToInputItems,
  assistantReasoningMessageToInputItems,
  assistantTextMessageToInputItem,
  assistantToolCallRequestToInputItem,
  toolSpecsToOpenAITools,
  userTextMessageToInputItem,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  BaseAssistantProviderPassthroughMessage,
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseAssistantToolCallRequestMessage,
  BaseUserTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { GPT_5_4, GPT_5_6_SOL } from "@app/lib/model_constructors/types/models";
import { describe, expect, it } from "vitest";

describe("assistantTextMessageToInputItem", () => {
  it("resends the phase when present", () => {
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "here is the answer" },
      phase: "final_answer",
    };
    expect(assistantTextMessageToInputItem(message)).toEqual({
      role: "assistant",
      content: "here is the answer",
      phase: "final_answer",
    });
  });

  it("omits the phase key when absent", () => {
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "no phase here" },
    };
    expect(assistantTextMessageToInputItem(message)).toEqual({
      role: "assistant",
      content: "no phase here",
    });
  });
});

describe("prompt cache breakpoints", () => {
  const message: BaseUserTextMessage = {
    role: "user",
    type: "text",
    content: { value: "Available skills" },
    cache: "short",
  };
  const metadata: EndpointMetadata = {
    lab: "openai",
    host: "openai-responses",
    region: "us",
    model: GPT_5_6_SOL,
  };

  it("serializes a cache marker when explicit prompt caching is supported", () => {
    expect(userTextMessageToInputItem(message, metadata)).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Available skills",
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ],
    });
  });

  it("does not serialize a cache marker for older models", () => {
    expect(
      userTextMessageToInputItem(message, { ...metadata, model: GPT_5_4 })
    ).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Available skills" }],
    });
  });

  it("does not serialize a cache marker when the message has not opted in", () => {
    expect(
      userTextMessageToInputItem({ ...message, cache: undefined }, metadata)
    ).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Available skills" }],
    });
  });
});

describe("assistantReasoningMessageToInputItems", () => {
  it("returns an empty array when there is no signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([]);
  });

  it("returns an empty array for an empty-string signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
      signature: "",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([]);
  });

  it("puts the signature in the `id` field, not the encrypted content", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "deep thoughts" },
      signature: "rs_123",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "deep thoughts" }],
      },
    ]);
  });

  it("emits `encrypted_content` alongside the id when present", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "deep thoughts" },
      signature: "rs_123",
      encryptedContent: "gAAAA-encrypted-blob",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "deep thoughts" }],
        encrypted_content: "gAAAA-encrypted-blob",
      },
    ]);
  });

  it("omits the summary when the reasoning value is empty", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "" },
      signature: "rs_123",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      { id: "rs_123", type: "reasoning", summary: [] },
    ]);
  });
});

describe("assistantToolCallRequestToInputItem", () => {
  it("replays a discovered function call with its namespace", () => {
    const message: BaseAssistantToolCallRequestMessage = {
      role: "assistant",
      type: "tool_call_request",
      content: {
        callId: "call_123",
        toolName: "get_weather",
        arguments: "{}",
        namespace: "weather",
      },
    };

    expect(assistantToolCallRequestToInputItem(message)).toEqual({
      type: "function_call",
      call_id: "call_123",
      name: "get_weather",
      arguments: "{}",
      namespace: "weather",
    });
  });
});

describe("toolSpecsToOpenAITools", () => {
  const eagerTool = {
    name: "get_time",
    description: "Get the current time",
    inputSchema: { type: "object", properties: {} },
    eager: true,
  };
  const deferredTool = {
    name: "get_weather",
    description: "Get the current weather",
    inputSchema: { type: "object", properties: {} },
  };

  it("prepends tool search and defers non-eager functions", () => {
    expect(
      toolSpecsToOpenAITools([eagerTool, deferredTool], {
        forceTool: undefined,
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

  it("keeps the forced function eager", () => {
    const tools = toolSpecsToOpenAITools([deferredTool], {
      forceTool: deferredTool.name,
      toolSearchEnabled: true,
    });

    expect(tools).toEqual([expect.objectContaining({ name: "get_weather" })]);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });
});

describe("assistantProviderPassthroughMessageToInputItems", () => {
  it("replays an OpenAI tool-search output item", () => {
    const message: BaseAssistantProviderPassthroughMessage = {
      role: "assistant",
      type: "provider_passthrough",
      content: {
        provider: "openai",
        block: {
          type: "tool_search_output",
          id: "tso_123",
          call_id: null,
          execution: "server",
          status: "completed",
          created_by: "openai",
          tools: [
            {
              type: "function",
              name: "get_weather",
              description: "Get the current weather",
              parameters: { type: "object", properties: {} },
              strict: false,
              defer_loading: true,
              future_tool_field: "preserve-me",
            },
          ],
        },
      },
    };

    expect(assistantProviderPassthroughMessageToInputItems(message)).toEqual([
      message.content.block,
    ]);
  });
});
