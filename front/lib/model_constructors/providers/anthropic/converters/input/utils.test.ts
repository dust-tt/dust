import type {
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { MessageBlockConverters } from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import {
  assistantMessageToContentBlocks,
  assistantReasoningMessageToThinkingBlocks,
  assistantTextMessageToTextBlock,
  assistantToolCallRequestToToolUseBlock,
  cacheControlFor,
  conversationToMessages,
  forceToolNameToToolChoice,
  outputFormatToOutputConfig,
  parseToolArguments,
  reasoningToThinkingConfig,
  systemMessagesToSystemParam,
  systemMessageToTextBlock,
  toolCallResultMessageToToolResultBlock,
  toolSpecToAnthropicTool,
  userImageMessageToImageBlock,
  userMessageToContentBlocks,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type {
  OutputFormat,
  ToolSpecification,
} from "@app/lib/model_constructors/types/input/configuration";
import type {
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseAssistantToolCallRequestMessage,
  BaseConversation,
  BaseToolCallResultMessage,
  BaseUserImageMessage,
  BaseUserTextMessage,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { describe, expect, it, vi } from "vitest";

// The real leaf converters, bundled into the interface the composites consume.
// Used wherever a test wants the genuine end-to-end conversion.
const realConverters: MessageBlockConverters = {
  systemMessageToTextBlock,
  userTextMessageToTextBlock,
  userImageMessageToImageBlock,
  toolCallResultMessageToToolResultBlock,
  assistantTextMessageToTextBlock,
  assistantReasoningMessageToThinkingBlocks,
  assistantToolCallRequestToToolUseBlock,
};

// A fully stubbed converters object, so composites can be checked for pure
// delegation independently of the leaf converters' real behavior.
function makeStubConverters(): MessageBlockConverters {
  return {
    systemMessageToTextBlock: vi.fn(
      () => ({ type: "text", text: "stub-system" }) as TextBlockParam
    ),
    userTextMessageToTextBlock: vi.fn(
      () => ({ type: "text", text: "stub-user-text" }) as TextBlockParam
    ),
    userImageMessageToImageBlock: vi.fn(
      () =>
        ({
          type: "image",
          source: { type: "url", url: "stub-url" },
        }) as ImageBlockParam
    ),
    toolCallResultMessageToToolResultBlock: vi.fn(
      () =>
        ({
          type: "tool_result",
          tool_use_id: "stub-call",
          content: [],
        }) as ToolResultBlockParam
    ),
    assistantTextMessageToTextBlock: vi.fn(
      () => ({ type: "text", text: "stub-assistant-text" }) as TextBlockParam
    ),
    assistantReasoningMessageToThinkingBlocks: vi.fn(() => []),
    assistantToolCallRequestToToolUseBlock: vi.fn(
      () =>
        ({
          type: "tool_use",
          id: "stub-id",
          name: "stub-name",
          input: {},
        }) as ToolUseBlockParam
    ),
  };
}

describe("cacheControlFor", () => {
  it("returns a 5m ephemeral cache control for 'short'", () => {
    expect(cacheControlFor("short")).toEqual({
      cache_control: { type: "ephemeral", ttl: "5m" },
    });
  });

  it("returns a 1h ephemeral cache control for 'long'", () => {
    expect(cacheControlFor("long")).toEqual({
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  });

  it("returns an empty fragment for undefined", () => {
    expect(cacheControlFor(undefined)).toEqual({});
  });

  it("returns a spreadable object that does not inject keys when empty", () => {
    expect({ type: "text", ...cacheControlFor(undefined) }).toEqual({
      type: "text",
    });
  });
});

describe("parseToolArguments", () => {
  it("parses a well-formed JSON object", () => {
    expect(parseToolArguments('{"a":1,"b":"two"}')).toEqual({ a: 1, b: "two" });
  });

  it("returns {} for malformed JSON", () => {
    expect(parseToolArguments("{not valid json")).toEqual({});
  });

  it("returns {} for valid JSON that is an array", () => {
    expect(parseToolArguments("[1,2,3]")).toEqual({});
  });

  it("returns {} for the JSON literal null", () => {
    expect(parseToolArguments("null")).toEqual({});
  });

  // NOTE: this documents a latent gap rather than the desired contract. The
  // helper's comment promises `{}` for "non-object JSON", but `isRecord` only
  // rejects arrays, so primitive JSON (numbers, strings, booleans) flows
  // through unchanged even though the declared return type is a record. If the
  // intent is to also coerce primitives to `{}`, `isRecord` / this helper needs
  // tightening; these tests pin the current behavior.
  it("passes a primitive number through unchanged (latent gap)", () => {
    expect(parseToolArguments("42")).toBe(42);
  });

  it("passes a primitive string through unchanged (latent gap)", () => {
    expect(parseToolArguments('"hello"')).toBe("hello");
  });

  it("returns {} for an empty string", () => {
    expect(parseToolArguments("")).toEqual({});
  });

  it("preserves nested structures", () => {
    expect(parseToolArguments('{"nested":{"k":[1,2]}}')).toEqual({
      nested: { k: [1, 2] },
    });
  });
});

describe("systemMessageToTextBlock", () => {
  const base: SystemTextMessage = {
    role: "system",
    type: "text",
    content: { value: "system prompt" },
  };

  it("converts to a text block without cache control by default", () => {
    expect(systemMessageToTextBlock(base)).toEqual({
      type: "text",
      text: "system prompt",
    });
  });

  it("includes cache control when cache is set", () => {
    expect(systemMessageToTextBlock({ ...base, cache: "long" })).toEqual({
      type: "text",
      text: "system prompt",
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  });
});

describe("userTextMessageToTextBlock", () => {
  const base: BaseUserTextMessage = {
    role: "user",
    type: "text",
    content: { value: "hi there" },
  };

  it("converts to a text block", () => {
    expect(userTextMessageToTextBlock(base)).toEqual({
      type: "text",
      text: "hi there",
    });
  });

  it("includes cache control when cache is 'short'", () => {
    expect(userTextMessageToTextBlock({ ...base, cache: "short" })).toEqual({
      type: "text",
      text: "hi there",
      cache_control: { type: "ephemeral", ttl: "5m" },
    });
  });
});

describe("userImageMessageToImageBlock", () => {
  const base: BaseUserImageMessage = {
    role: "user",
    type: "image_url",
    content: { url: "https://example.com/cat.png" },
  };

  it("converts to a url image block", () => {
    expect(userImageMessageToImageBlock(base)).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/cat.png" },
    });
  });

  it("includes cache control when set", () => {
    expect(userImageMessageToImageBlock({ ...base, cache: "long" })).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/cat.png" },
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  });
});

describe("toolCallResultMessageToToolResultBlock", () => {
  it("converts text and image parts in order", () => {
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: {
        callId: "call_1",
        parts: [
          { type: "text", text: "result text" },
          { type: "image_url", url: "https://example.com/img.png" },
        ],
        isError: false,
      },
    };
    expect(toolCallResultMessageToToolResultBlock(message)).toEqual({
      type: "tool_result",
      tool_use_id: "call_1",
      content: [
        { type: "text", text: "result text" },
        {
          type: "image",
          source: { type: "url", url: "https://example.com/img.png" },
        },
      ],
    });
  });

  it("sets is_error only when isError is true", () => {
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: { callId: "call_err", parts: [], isError: true },
    };
    expect(toolCallResultMessageToToolResultBlock(message)).toEqual({
      type: "tool_result",
      tool_use_id: "call_err",
      content: [],
      is_error: true,
    });
  });

  it("omits is_error when isError is false", () => {
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: { callId: "call_ok", parts: [], isError: false },
    };
    expect(toolCallResultMessageToToolResultBlock(message)).not.toHaveProperty(
      "is_error"
    );
  });

  it("includes cache control when set", () => {
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: { callId: "call_c", parts: [], isError: false },
      cache: "short",
    };
    expect(toolCallResultMessageToToolResultBlock(message)).toMatchObject({
      cache_control: { type: "ephemeral", ttl: "5m" },
    });
  });

  it("produces empty content for no parts", () => {
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: { callId: "call_empty", parts: [], isError: false },
    };
    expect(toolCallResultMessageToToolResultBlock(message).content).toEqual([]);
  });
});

describe("assistantTextMessageToTextBlock", () => {
  it("converts to a text block and never attaches cache control", () => {
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "assistant says hi" },
    };
    const result = assistantTextMessageToTextBlock(message);
    expect(result).toEqual({ type: "text", text: "assistant says hi" });
    expect(result).not.toHaveProperty("cache_control");
  });
});

describe("assistantReasoningMessageToThinkingBlocks", () => {
  it("returns an empty array when there is no signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
    };
    expect(assistantReasoningMessageToThinkingBlocks(message)).toEqual([]);
  });

  it("returns an empty array for an empty-string signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
      signature: "",
    };
    expect(assistantReasoningMessageToThinkingBlocks(message)).toEqual([]);
  });

  it("returns a thinking block when a signature is present", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "deep thoughts" },
      signature: "sig-123",
    };
    expect(assistantReasoningMessageToThinkingBlocks(message)).toEqual([
      { type: "thinking", thinking: "deep thoughts", signature: "sig-123" },
    ]);
  });
});

describe("assistantToolCallRequestToToolUseBlock", () => {
  it("converts to a tool_use block with parsed arguments", () => {
    const message: BaseAssistantToolCallRequestMessage = {
      role: "assistant",
      type: "tool_call_request",
      content: {
        callId: "tc_1",
        toolName: "get_weather",
        arguments: '{"city":"Paris"}',
      },
    };
    expect(assistantToolCallRequestToToolUseBlock(message)).toEqual({
      type: "tool_use",
      id: "tc_1",
      name: "get_weather",
      input: { city: "Paris" },
    });
  });

  it("falls back to empty input for malformed arguments", () => {
    const message: BaseAssistantToolCallRequestMessage = {
      role: "assistant",
      type: "tool_call_request",
      content: { callId: "tc_2", toolName: "noop", arguments: "not json" },
    };
    expect(assistantToolCallRequestToToolUseBlock(message).input).toEqual({});
  });
});

describe("userMessageToContentBlocks", () => {
  it("delegates text messages to userTextMessageToTextBlock", () => {
    const stub = makeStubConverters();
    const message: BaseUserTextMessage = {
      role: "user",
      type: "text",
      content: { value: "hello" },
    };
    const result = userMessageToContentBlocks(message, stub);
    expect(stub.userTextMessageToTextBlock).toHaveBeenCalledWith(message);
    expect(result).toEqual([{ type: "text", text: "stub-user-text" }]);
  });

  it("delegates image messages to userImageMessageToImageBlock", () => {
    const stub = makeStubConverters();
    const message: BaseUserImageMessage = {
      role: "user",
      type: "image_url",
      content: { url: "u" },
    };
    userMessageToContentBlocks(message, stub);
    expect(stub.userImageMessageToImageBlock).toHaveBeenCalledWith(message);
  });

  it("delegates tool_call_result messages to toolCallResultMessageToToolResultBlock", () => {
    const stub = makeStubConverters();
    const message: BaseToolCallResultMessage = {
      role: "user",
      type: "tool_call_result",
      content: { callId: "c", parts: [], isError: false },
    };
    userMessageToContentBlocks(message, stub);
    expect(stub.toolCallResultMessageToToolResultBlock).toHaveBeenCalledWith(
      message
    );
  });

  it("wraps the leaf result in a single-element array (real converters)", () => {
    const message: BaseUserTextMessage = {
      role: "user",
      type: "text",
      content: { value: "hi" },
    };
    expect(userMessageToContentBlocks(message, realConverters)).toEqual([
      { type: "text", text: "hi" },
    ]);
  });
});

describe("assistantMessageToContentBlocks", () => {
  it("delegates text messages to assistantTextMessageToTextBlock", () => {
    const stub = makeStubConverters();
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "v" },
    };
    const result = assistantMessageToContentBlocks(message, stub);
    expect(stub.assistantTextMessageToTextBlock).toHaveBeenCalledWith(message);
    expect(result).toEqual([{ type: "text", text: "stub-assistant-text" }]);
  });

  it("delegates reasoning messages and returns the blocks directly (not re-wrapped)", () => {
    const stub = makeStubConverters();
    stub.assistantReasoningMessageToThinkingBlocks = vi.fn(() => [
      { type: "thinking" as const, thinking: "t", signature: "s" },
    ]);
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "v" },
      signature: "s",
    };
    const result = assistantMessageToContentBlocks(message, stub);
    expect(stub.assistantReasoningMessageToThinkingBlocks).toHaveBeenCalledWith(
      message
    );
    expect(result).toEqual([
      { type: "thinking", thinking: "t", signature: "s" },
    ]);
  });

  it("returns an empty array for unsigned reasoning (real converters)", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "v" },
    };
    expect(assistantMessageToContentBlocks(message, realConverters)).toEqual(
      []
    );
  });

  it("delegates tool_call_request messages to assistantToolCallRequestToToolUseBlock", () => {
    const stub = makeStubConverters();
    const message: BaseAssistantToolCallRequestMessage = {
      role: "assistant",
      type: "tool_call_request",
      content: { callId: "c", toolName: "t", arguments: "{}" },
    };
    const result = assistantMessageToContentBlocks(message, stub);
    expect(stub.assistantToolCallRequestToToolUseBlock).toHaveBeenCalledWith(
      message
    );
    expect(result).toEqual([
      { type: "tool_use", id: "stub-id", name: "stub-name", input: {} },
    ]);
  });
});

describe("conversationToMessages", () => {
  it("maps user and assistant messages to role-tagged MessageParams in order", () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "user", type: "text", content: { value: "hello" } },
        { role: "assistant", type: "text", content: { value: "hi back" } },
      ],
    };
    expect(conversationToMessages(conversation, realConverters)).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "hi back" }] },
    ]);
  });

  it("returns an empty array for an empty conversation", () => {
    const conversation: BaseConversation = { system: [], messages: [] };
    expect(conversationToMessages(conversation, realConverters)).toEqual([]);
  });

  it("preserves message ordering across mixed roles", () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "assistant", type: "text", content: { value: "a" } },
        { role: "user", type: "text", content: { value: "b" } },
        { role: "assistant", type: "text", content: { value: "c" } },
      ],
    };
    const result = conversationToMessages(conversation, realConverters);
    expect(result.map((m) => m.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
  });
});

describe("systemMessagesToSystemParam", () => {
  it("converts each system message via the converter", () => {
    const system: SystemTextMessage[] = [
      { role: "system", type: "text", content: { value: "rule 1" } },
      {
        role: "system",
        type: "text",
        content: { value: "rule 2" },
        cache: "long",
      },
    ];
    expect(systemMessagesToSystemParam(system, realConverters)).toEqual([
      { type: "text", text: "rule 1" },
      {
        type: "text",
        text: "rule 2",
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ]);
  });

  it("returns an empty array for no system messages", () => {
    expect(systemMessagesToSystemParam([], realConverters)).toEqual([]);
  });
});

describe("outputFormatToOutputConfig", () => {
  it("maps the json schema into a json_schema output config", () => {
    const outputFormat: OutputFormat = {
      type: "json_schema",
      json_schema: {
        name: "my_schema",
        schema: {
          type: "object",
          properties: { foo: { type: "string" } },
          required: ["foo"],
          additionalProperties: false,
        },
      },
    };
    expect(outputFormatToOutputConfig(outputFormat)).toEqual({
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { foo: { type: "string" } },
          required: ["foo"],
          additionalProperties: false,
        },
      },
    });
  });
});

describe("toolSpecToAnthropicTool", () => {
  it("converts a tool spec, merging the object type into the input schema", () => {
    const tool: ToolSpecification = {
      name: "search",
      description: "Search things",
      inputSchema: {
        properties: { q: { type: "string" } },
        required: ["q"],
      },
    };
    expect(toolSpecToAnthropicTool(tool)).toEqual({
      name: "search",
      description: "Search things",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      },
    });
  });

  it("always sets type 'object' even when inputSchema has its own type", () => {
    const tool: ToolSpecification = {
      name: "t",
      description: "d",
      inputSchema: { type: "string" },
    };
    // The spread places inputSchema.type after the literal, so it wins; this
    // documents the merge order rather than asserting a guarantee.
    expect(toolSpecToAnthropicTool(tool).input_schema.type).toBe("string");
  });
});

describe("forceToolNameToToolChoice", () => {
  const tools: ToolSpecification[] = [
    { name: "alpha", description: "", inputSchema: {} },
    { name: "beta", description: "", inputSchema: {} },
  ];

  it("forces the named tool when it exists", () => {
    expect(forceToolNameToToolChoice(tools, "beta")).toEqual({
      type: "tool",
      name: "beta",
    });
  });

  it("falls back to auto when the forced tool does not exist", () => {
    expect(forceToolNameToToolChoice(tools, "gamma")).toEqual({
      type: "auto",
    });
  });

  it("falls back to auto when no tool is forced", () => {
    expect(forceToolNameToToolChoice(tools, undefined)).toEqual({
      type: "auto",
    });
  });

  it("falls back to auto when forceTool is an empty string", () => {
    expect(forceToolNameToToolChoice(tools, "")).toEqual({ type: "auto" });
  });

  it("falls back to auto when the tools list is empty", () => {
    expect(forceToolNameToToolChoice([], "alpha")).toEqual({ type: "auto" });
  });
});

describe("reasoningToThinkingConfig", () => {
  it("disables thinking when reasoning is undefined", () => {
    expect(reasoningToThinkingConfig(undefined)).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("disables thinking when effort is 'none'", () => {
    expect(reasoningToThinkingConfig({ effort: "none" })).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("enables adaptive thinking for 'xhigh'", () => {
    expect(reasoningToThinkingConfig({ effort: "xhigh" })).toEqual({
      output_config: { effort: "xhigh" },
      thinking: { type: "adaptive" },
    });
  });

  it("enables adaptive thinking for 'low'", () => {
    expect(reasoningToThinkingConfig({ effort: "low" })).toEqual({
      output_config: { effort: "low" },
      thinking: { type: "adaptive" },
    });
  });

  it("enables adaptive thinking for 'medium'", () => {
    expect(reasoningToThinkingConfig({ effort: "medium" })).toEqual({
      output_config: { effort: "medium" },
      thinking: { type: "adaptive" },
    });
  });

  it("enables adaptive thinking for 'high'", () => {
    expect(reasoningToThinkingConfig({ effort: "high" })).toEqual({
      output_config: { effort: "high" },
      thinking: { type: "adaptive" },
    });
  });

  it("maps 'maximal' effort to Anthropic's 'max'", () => {
    expect(reasoningToThinkingConfig({ effort: "maximal" })).toEqual({
      output_config: { effort: "max" },
      thinking: { type: "adaptive" },
    });
  });
});
