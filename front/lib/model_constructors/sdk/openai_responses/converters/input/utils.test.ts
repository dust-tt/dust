import {
  assistantProviderPassthroughMessageToInputItems,
  assistantReasoningMessageToInputItems,
  assistantTextMessageToInputItem,
  assistantToolCallRequestToInputItem,
  toolNamesCalledWithoutNamespace,
  toolSpecsToOpenAITools,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import { OpenAIGptFiveDotFourGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_global_openai_responses";
import { OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import type {
  BaseAssistantProviderPassthroughMessage,
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseAssistantToolCallRequestMessage,
  BaseConversation,
  BaseUserTextMessage,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { TOOL_SEARCH_INSTRUCTION } from "@app/lib/model_constructors/types/tool_search";
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
  const system: SystemTextMessage[] = [
    {
      role: "system",
      type: "text",
      content: { value: "Instructions" },
      cache: "long",
    },
    {
      role: "system",
      type: "text",
      content: { value: "Shared context" },
      cache: "short",
    },
    {
      role: "system",
      type: "text",
      content: { value: "Ephemeral context" },
    },
  ];
  const supportedEndpoint =
    new OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream({
      OPENAI_API_KEY: "",
    });
  const unsupportedEndpoint =
    new OpenAIGptFiveDotFourGlobalOpenAIResponsesStream({
      OPENAI_API_KEY: "",
    });
  const conversationWith = (userMessage: BaseUserTextMessage) => ({
    system: [],
    messages: [userMessage],
  });

  it("serializes a cache marker with the default endpoint converter", () => {
    expect(
      supportedEndpoint.conversationToInput(conversationWith(message))
    ).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Available skills",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
    ]);
  });

  it("maps long cache opt-in to the request-wide breakpoint", () => {
    expect(
      supportedEndpoint.conversationToInput(
        conversationWith({ ...message, cache: "long" })
      )
    ).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Available skills",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
    ]);
  });

  it("serializes cache markers on stable system prompt tiers", () => {
    expect(supportedEndpoint.systemMessagesToInputItems(system)).toEqual([
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

  it("serializes the complete cached prefix alongside tools", () => {
    const payload = supportedEndpoint.buildRequestPayload(
      {
        conversation: {
          system,
          messages: [
            message,
            {
              role: "user",
              type: "text",
              content: { value: "Current request" },
            },
          ],
        },
      },
      {
        cacheKey: "conversation-123",
        tools: [
          {
            name: "search_docs",
            description: "Search documentation",
            inputSchema: { properties: {} },
          },
        ],
      }
    );

    expect(payload.prompt_cache_key).toBe("conversation-123");
    expect(payload.tools).toEqual([
      {
        type: "function",
        name: "search_docs",
        description: "Search documentation",
        strict: false,
        parameters: { type: "object", properties: {} },
      },
    ]);
    expect(payload.input).toEqual([
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
            text: "Available skills",
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

  it("preserves cache breakpoints when adding tool search guidance", () => {
    const payload = supportedEndpoint.buildRequestPayload(
      {
        conversation: {
          system,
          messages: [],
        },
      },
      {
        toolSearchEnabled: true,
        tools: [
          {
            name: "search_docs",
            description: "Search documentation",
            inputSchema: { properties: {} },
          },
        ],
      }
    );

    expect(payload.input).toBeDefined();
    if (!payload.input) {
      return;
    }
    expect(payload.input.slice(0, system.length)).toEqual(
      supportedEndpoint.systemMessagesToInputItems(system)
    );
    expect(payload.input[system.length]).toEqual({
      role: "developer",
      content: [{ type: "input_text", text: TOOL_SEARCH_INSTRUCTION }],
    });
    expect(payload.tools?.[0]).toEqual({ type: "tool_search" });
  });

  it("does not serialize breakpoints on following messages without cache opt-in", () => {
    expect(
      supportedEndpoint.conversationToInput({
        system: [],
        messages: [
          message,
          {
            role: "user",
            type: "text",
            content: { value: "Current request" },
          },
        ],
      })
    ).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Available skills",
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

  it("uses the endpoint override for models without explicit caching", () => {
    expect(
      unsupportedEndpoint.conversationToInput(conversationWith(message))
    ).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "Available skills" }],
      },
    ]);
  });

  it("uses the endpoint override for cached system messages", () => {
    expect(unsupportedEndpoint.systemMessagesToInputItems(system)).toEqual([
      {
        role: "developer",
        content: [{ type: "input_text", text: "Instructions" }],
      },
      {
        role: "developer",
        content: [{ type: "input_text", text: "Shared context" }],
      },
      {
        role: "developer",
        content: [{ type: "input_text", text: "Ephemeral context" }],
      },
    ]);
  });

  it("does not serialize a cache marker when the message has not opted in", () => {
    expect(
      supportedEndpoint.conversationToInput(
        conversationWith({ ...message, cache: undefined })
      )
    ).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "Available skills" }],
      },
    ]);
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
  const otherDeferredTool = {
    name: "get_stock",
    description: "Get a stock price",
    inputSchema: { type: "object", properties: {} },
  };

  it("prepends tool search and defers non-eager functions", () => {
    expect(
      toolSpecsToOpenAITools([eagerTool, deferredTool], {
        forceTool: undefined,
        toolSearchEnabled: true,
        toolNamesRequiringDefaultNamespace: new Set(),
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
      toolNamesRequiringDefaultNamespace: new Set(),
    });

    expect(tools).toEqual([expect.objectContaining({ name: "get_weather" })]);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });

  it("keeps a function replayed without a namespace eager", () => {
    const tools = toolSpecsToOpenAITools([deferredTool], {
      forceTool: undefined,
      toolSearchEnabled: true,
      toolNamesRequiringDefaultNamespace: new Set([deferredTool.name]),
    });

    expect(tools).toEqual([expect.objectContaining({ name: "get_weather" })]);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });

  it("keeps deferring the other functions when one is promoted", () => {
    expect(
      toolSpecsToOpenAITools([deferredTool, otherDeferredTool], {
        forceTool: undefined,
        toolSearchEnabled: true,
        toolNamesRequiringDefaultNamespace: new Set([deferredTool.name]),
      })
    ).toEqual([
      { type: "tool_search" },
      expect.objectContaining({ name: "get_weather" }),
      expect.objectContaining({ name: "get_stock", defer_loading: true }),
    ]);
  });

  it("still defers the functions no namespaceless call names", () => {
    const tools = toolSpecsToOpenAITools([deferredTool], {
      forceTool: undefined,
      toolSearchEnabled: true,
      toolNamesRequiringDefaultNamespace: new Set(["other_tool"]),
    });

    expect(tools).toEqual([
      { type: "tool_search" },
      expect.objectContaining({ name: "get_weather", defer_loading: true }),
    ]);
  });
});

describe("toolNamesCalledWithoutNamespace", () => {
  function toolCall(
    toolName: string,
    namespace?: string
  ): BaseAssistantToolCallRequestMessage {
    return {
      role: "assistant",
      type: "tool_call_request",
      content: {
        callId: `call_${toolName}`,
        toolName,
        arguments: "{}",
        ...(namespace ? { namespace } : {}),
      },
    };
  }

  it("collects only the calls carrying no namespace", () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "user", type: "text", content: { value: "hello" } },
        toolCall("get_weather"),
        toolCall("get_time", "get_time"),
      ],
    };

    expect(toolNamesCalledWithoutNamespace(conversation)).toEqual(
      new Set(["get_weather"])
    );
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
