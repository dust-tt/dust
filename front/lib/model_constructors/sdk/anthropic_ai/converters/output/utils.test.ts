import {
  AnthropicError,
  APIConnectionError,
  APIError,
} from "@anthropic-ai/sdk";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches";
import type {
  CacheCreation,
  Message,
  MessageDeltaUsage,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { OutputEventConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  accumulatedToolCallToToolCallEvent,
  batchResultToEvents,
  contentBlockDeltaToEvents,
  contentBlockStartToEvents,
  contentBlockStopToEvents,
  getInvalidToolJsonMessage,
  inputJsonDeltaToToolCallDeltaEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaToEvents,
  messageDeltaUsageToTokenUsageEvent,
  messageStartToResponseIdEvent,
  messageToEvents,
  rawOutputToEvents,
  reasoningDeltaToReasoningDeltaEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  toolUseBlockStartToToolCallStartedEvent,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { describe, expect, it, vi } from "vitest";

const metadata: EndpointMetadata = {
  providerId: "anthropic",
  api: "anthropic",
  region: "us",
  modelId: "claude-sonnet-4-6",
};

// The real leaf converters, bundled into the interface the composites consume.
// Used wherever a test wants the genuine end-to-end conversion.
const realConverters: OutputEventConverters = {
  messageStartToResponseIdEvent,
  textDeltaToTextDeltaEvent,
  reasoningDeltaToReasoningDeltaEvent,
  accumulatedTextToTextEvent,
  accumulatedReasoningToReasoningEvent,
  toolUseBlockStartToToolCallStartedEvent,
  inputJsonDeltaToToolCallDeltaEvent,
  accumulatedToolCallToToolCallEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaUsageToTokenUsageEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
};

// A fully stubbed converters object, so composites can be checked for pure
// delegation independently of the leaf converters' real behavior.
function makeStubConverters(): OutputEventConverters {
  return {
    messageStartToResponseIdEvent: vi.fn(() => ({
      type: "response_id" as const,
      content: { responseId: "stub-response-id" },
      metadata,
    })),
    textDeltaToTextDeltaEvent: vi.fn(() => ({
      type: "text_delta" as const,
      content: { value: "stub-text-delta" },
      metadata,
    })),
    reasoningDeltaToReasoningDeltaEvent: vi.fn(() => ({
      type: "reasoning_delta" as const,
      content: { value: "stub-reasoning-delta" },
      metadata,
    })),
    accumulatedTextToTextEvent: vi.fn(() => ({
      type: "text" as const,
      content: { value: "stub-text" },
      metadata,
    })),
    accumulatedReasoningToReasoningEvent: vi.fn(() => ({
      type: "reasoning" as const,
      content: { value: "stub-reasoning" },
      metadata,
    })),
    toolUseBlockStartToToolCallStartedEvent: vi.fn(() => ({
      type: "tool_call_started" as const,
      content: { id: "stub-tool-id", index: 0, name: "stub-tool" },
      metadata,
    })),
    inputJsonDeltaToToolCallDeltaEvent: vi.fn(() => ({
      type: "tool_call_delta" as const,
      metadata,
    })),
    accumulatedToolCallToToolCallEvent: vi.fn(() => ({
      type: "tool_call" as const,
      content: { id: "stub-tool-id", name: "stub-tool", arguments: {} },
      metadata,
    })),
    invalidJsonToolCallToToolCallEvent: vi.fn(() => ({
      type: "tool_call" as const,
      content: {
        id: "stub-tool-id",
        name: "stub-tool",
        arguments: { INVALID_JSON: "stub-invalid" },
      },
      metadata,
    })),
    messageDeltaUsageToTokenUsageEvent: vi.fn(() => ({
      type: "token_usage" as const,
      content: {
        cacheCreated: 0,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 0,
        standardInput: 0,
        standardOutput: 0,
        reasoning: 0,
      },
      metadata,
    })),
    stopReasonToErrorEvent: vi.fn(() => null),
    streamErrorToErrorEvent: vi.fn(() => ({
      type: "error" as const,
      content: { type: "unknown_error" as const, message: "stub-error" },
      metadata,
    })),
  };
}

// Yields the provided events as an async stream, optionally throwing at the end.
async function* streamOf(
  events: RawMessageStreamEvent[],
  throwAtEnd?: unknown
): AsyncGenerator<RawMessageStreamEvent> {
  for (const event of events) {
    yield event;
  }
  if (throwAtEnd !== undefined) {
    throw throwAtEnd;
  }
}

async function collect(
  generator: AsyncGenerator<ModelResponseEvent>
): Promise<ModelResponseEvent[]> {
  const out: ModelResponseEvent[] = [];
  for await (const event of generator) {
    out.push(event);
  }
  return out;
}

const INVALID_TOOL_JSON_MESSAGE =
  "Unable to parse tool parameter JSON: {bad json";

function apiInvalidToolJsonError(): APIError {
  return new APIError(
    400,
    {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: INVALID_TOOL_JSON_MESSAGE,
      },
    },
    INVALID_TOOL_JSON_MESSAGE,
    undefined,
    "invalid_request_error"
  );
}

describe("getInvalidToolJsonMessage", () => {
  it("extracts the message from a matching APIError", () => {
    expect(getInvalidToolJsonMessage(apiInvalidToolJsonError())).toBe(
      INVALID_TOOL_JSON_MESSAGE
    );
  });

  it("extracts the message from a matching AnthropicError", () => {
    const err = new AnthropicError(INVALID_TOOL_JSON_MESSAGE);
    expect(getInvalidToolJsonMessage(err)).toBe(INVALID_TOOL_JSON_MESSAGE);
  });

  it("returns null for an APIError that is neither structurally nor textually a tool-JSON error", () => {
    const err = new APIError(
      400,
      {
        type: "error",
        error: { type: "api_error", message: "different problem" },
      },
      "different problem",
      undefined,
      "api_error"
    );
    expect(getInvalidToolJsonMessage(err)).toBeNull();
  });

  // The structured APIError guard requires type === "invalid_request_error", but
  // APIError extends AnthropicError and its message embeds the serialized body.
  // So a needle-bearing APIError still matches via the textual fallback even
  // when its `type` is something else.
  it("still matches a needle-bearing APIError via the AnthropicError fallback", () => {
    const err = new APIError(
      400,
      {
        type: "error",
        error: { type: "api_error", message: INVALID_TOOL_JSON_MESSAGE },
      },
      INVALID_TOOL_JSON_MESSAGE,
      undefined,
      "api_error"
    );
    expect(getInvalidToolJsonMessage(err)).toContain(INVALID_TOOL_JSON_MESSAGE);
  });

  it("returns null for an APIError missing the needle", () => {
    const err = new APIError(
      400,
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Some other problem" },
      },
      "Some other problem",
      undefined,
      "invalid_request_error"
    );
    expect(getInvalidToolJsonMessage(err)).toBeNull();
  });

  it("returns null for an AnthropicError missing the needle", () => {
    expect(
      getInvalidToolJsonMessage(new AnthropicError("network blip"))
    ).toBeNull();
  });

  it("returns null for an unrelated error", () => {
    expect(getInvalidToolJsonMessage(new Error("boom"))).toBeNull();
    expect(getInvalidToolJsonMessage("a string")).toBeNull();
    expect(getInvalidToolJsonMessage(null)).toBeNull();
  });
});

describe("messageStartToResponseIdEvent", () => {
  it("maps the message id into a response_id event", () => {
    const event = {
      type: "message_start",
      message: { id: "msg_123" },
    } as RawMessageStartEvent;
    expect(messageStartToResponseIdEvent(metadata, event)).toEqual({
      type: "response_id",
      content: { responseId: "msg_123" },
      metadata,
    });
  });
});

describe("textDeltaToTextDeltaEvent", () => {
  it("wraps the delta string in a text_delta event", () => {
    expect(textDeltaToTextDeltaEvent(metadata, "chunk")).toEqual({
      type: "text_delta",
      content: { value: "chunk" },
      metadata,
    });
  });
});

describe("reasoningDeltaToReasoningDeltaEvent", () => {
  it("wraps the delta string in a reasoning_delta event", () => {
    expect(reasoningDeltaToReasoningDeltaEvent(metadata, "thinking")).toEqual({
      type: "reasoning_delta",
      content: { value: "thinking" },
      metadata,
    });
  });
});

describe("accumulatedTextToTextEvent", () => {
  it("wraps the accumulated text in a text event", () => {
    expect(accumulatedTextToTextEvent(metadata, "full text")).toEqual({
      type: "text",
      content: { value: "full text" },
      metadata,
    });
  });
});

describe("accumulatedReasoningToReasoningEvent", () => {
  it("emits a reasoning event without a signature when none is given", () => {
    expect(accumulatedReasoningToReasoningEvent(metadata, "thoughts")).toEqual({
      type: "reasoning",
      content: { value: "thoughts" },
      metadata,
    });
  });

  it("threads the signature into metadata.content when present", () => {
    expect(
      accumulatedReasoningToReasoningEvent(metadata, "thoughts", "sig-1")
    ).toEqual({
      type: "reasoning",
      content: { value: "thoughts" },
      metadata: { ...metadata, content: { signature: "sig-1" } },
    });
  });
});

describe("toolUseBlockStartToToolCallStartedEvent", () => {
  it("maps id, index and name into a tool_call_started event", () => {
    expect(
      toolUseBlockStartToToolCallStartedEvent(metadata, "id-1", 2, "search")
    ).toEqual({
      type: "tool_call_started",
      content: { id: "id-1", index: 2, name: "search" },
      metadata,
    });
  });
});

describe("inputJsonDeltaToToolCallDeltaEvent", () => {
  it("emits a content-free tool_call_delta heartbeat", () => {
    expect(inputJsonDeltaToToolCallDeltaEvent(metadata)).toEqual({
      type: "tool_call_delta",
      metadata,
    });
  });
});

describe("accumulatedToolCallToToolCallEvent", () => {
  it("parses the arguments JSON into the tool_call event", () => {
    expect(
      accumulatedToolCallToToolCallEvent(
        metadata,
        "id-1",
        "search",
        '{"q":"cats"}'
      )
    ).toEqual({
      type: "tool_call",
      content: { id: "id-1", name: "search", arguments: { q: "cats" } },
      metadata,
    });
  });

  it("falls back to empty arguments for malformed JSON", () => {
    expect(
      accumulatedToolCallToToolCallEvent(metadata, "id-1", "search", "not json")
        .content.arguments
    ).toEqual({});
  });
});

describe("invalidJsonToolCallToToolCallEvent", () => {
  it("wraps the invalid JSON under an INVALID_JSON key", () => {
    expect(
      invalidJsonToolCallToToolCallEvent(metadata, "id-1", "search", "{bad")
    ).toEqual({
      type: "tool_call",
      content: {
        id: "id-1",
        name: "search",
        arguments: { INVALID_JSON: "{bad" },
      },
      metadata,
    });
  });
});

describe("messageDeltaUsageToTokenUsageEvent", () => {
  it("splits cache creation by TTL when the breakdown is present", () => {
    const usage: MessageDeltaUsage = {
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
      input_tokens: 100,
      output_tokens: 50,
      output_tokens_details: { thinking_tokens: 15 },
      server_tool_use: null,
    };
    const cacheCreation: CacheCreation = {
      ephemeral_1h_input_tokens: 6,
      ephemeral_5m_input_tokens: 4,
    };
    expect(
      messageDeltaUsageToTokenUsageEvent(metadata, usage, cacheCreation)
    ).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 0,
        longCacheCreated: 6,
        shortCacheCreated: 4,
        cacheHit: 20,
        standardInput: 100,
        standardOutput: 35,
        reasoning: 15,
      },
      metadata,
    });
  });

  it("reports the flat cache-creation total as cacheCreated when no breakdown is present", () => {
    const usage: MessageDeltaUsage = {
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
      input_tokens: 100,
      output_tokens: 50,
      output_tokens_details: { thinking_tokens: 15 },
      server_tool_use: null,
    };
    expect(messageDeltaUsageToTokenUsageEvent(metadata, usage, null)).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 10,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 20,
        standardInput: 100,
        standardOutput: 35,
        reasoning: 15,
      },
      metadata,
    });
  });

  it("rolls reasoning into standardOutput when there is no breakdown", () => {
    const usage: MessageDeltaUsage = {
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      input_tokens: null,
      output_tokens: 40,
      output_tokens_details: null,
      server_tool_use: null,
    };
    expect(messageDeltaUsageToTokenUsageEvent(metadata, usage, null)).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 0,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 0,
        standardInput: 0,
        standardOutput: 40,
        reasoning: 0,
      },
      metadata,
    });
  });
});

describe("stopReasonToErrorEvent", () => {
  it("maps max_tokens to a stop_error event", () => {
    expect(stopReasonToErrorEvent(metadata, "max_tokens")).toMatchObject({
      type: "error",
      content: { type: "stop_error" },
    });
  });

  it("maps refusal to a refusal_error event", () => {
    expect(stopReasonToErrorEvent(metadata, "refusal")).toMatchObject({
      type: "error",
      content: { type: "refusal_error" },
    });
  });

  it("returns null for end_turn and other stop reasons", () => {
    expect(stopReasonToErrorEvent(metadata, "end_turn")).toBeNull();
    expect(stopReasonToErrorEvent(metadata, "tool_use")).toBeNull();
  });
});

describe("streamErrorToErrorEvent", () => {
  it("maps invalid tool JSON to a retryable model_output_error", () => {
    const result = streamErrorToErrorEvent(metadata, apiInvalidToolJsonError());
    expect(result.content.type).toBe("model_output_error");
  });

  it("maps APIConnectionError to network_error", () => {
    const err = new APIConnectionError({ message: "connection reset" });
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("network_error");
    expect(result.content.originalError).toBe(err);
  });

  it.each([
    [400, "invalid_request_error"],
    [422, "invalid_request_error"],
    [401, "authentication_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
    [429, "rate_limit_error"],
    [503, "overloaded_error"],
  ] as const)("maps HTTP %i to %s", (status, expectedType) => {
    const err = new APIError(status, {}, "http failure", undefined, null);
    expect(streamErrorToErrorEvent(metadata, err).content.type).toBe(
      expectedType
    );
  });

  it("maps a generic 5xx status to server_error", () => {
    const err = new APIError(500, {}, "kaboom", undefined, null);
    expect(streamErrorToErrorEvent(metadata, err).content.type).toBe(
      "server_error"
    );
  });

  it("maps an unrecognized status to unknown_error", () => {
    const err = new APIError(418, {}, "teapot", undefined, null);
    expect(streamErrorToErrorEvent(metadata, err).content.type).toBe(
      "unknown_error"
    );
  });

  it("maps a non-SDK error to unknown_error", () => {
    expect(streamErrorToErrorEvent(metadata, "boom").content.type).toBe(
      "unknown_error"
    );
  });
});

describe("contentBlockStartToEvents", () => {
  it("opens a text block with no events emitted", () => {
    const event = {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: [] },
    } as RawContentBlockStartEvent;
    const [events, state] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(state).toEqual({ index: 0, accumulator: "", type: "text" });
  });

  it("opens a thinking block as a reasoning cursor", () => {
    const event = {
      type: "content_block_start",
      index: 1,
      content_block: { type: "thinking", thinking: "", signature: "" },
    } as RawContentBlockStartEvent;
    const [events, state] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(state).toEqual({ index: 1, accumulator: "", type: "reasoning" });
  });

  it("emits a tool_call_started event and a tool_use cursor", () => {
    const stub = makeStubConverters();
    const event = {
      type: "content_block_start",
      index: 3,
      content_block: {
        type: "tool_use",
        id: "tu-1",
        name: "lookup",
        input: {},
      },
    } as RawContentBlockStartEvent;
    const [events, state] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      stub
    );
    expect(stub.toolUseBlockStartToToolCallStartedEvent).toHaveBeenCalledWith(
      metadata,
      "tu-1",
      3,
      "lookup"
    );
    expect(events).toHaveLength(1);
    expect(state).toEqual({
      index: 3,
      accumulator: "",
      type: "tool_use",
      toolId: "tu-1",
      toolName: "lookup",
    });
  });

  it("passes through the existing state for ignored block types", () => {
    const event = {
      type: "content_block_start",
      index: 4,
      content_block: { type: "redacted_thinking", data: "xxx" },
    } as RawContentBlockStartEvent;
    const prior = { index: 0, accumulator: "abc", type: "text" as const };
    const [events, state] = contentBlockStartToEvents(
      event,
      prior,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(state).toBe(prior);
  });

  it("opens a server tool search block as a tool_search cursor", () => {
    const event = {
      type: "content_block_start",
      index: 5,
      content_block: {
        type: "server_tool_use",
        id: "srvtoolu_1",
        name: "tool_search_tool_bm25",
        input: {},
      },
    } as RawContentBlockStartEvent;
    const [events, state] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(state).toEqual({
      index: 5,
      accumulator: "",
      type: "tool_search",
      toolName: "tool_search_tool_bm25",
    });
  });

  it("consumes a tool search result block without opening a cursor", () => {
    const event = {
      type: "content_block_start",
      index: 6,
      content_block: {
        type: "tool_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: {
          type: "tool_search_tool_search_result",
          tool_references: [
            { type: "tool_reference", tool_name: "slack__post_message" },
          ],
        },
      },
    } as RawContentBlockStartEvent;
    const [events, state] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(state).toBeNull();
  });
});

describe("contentBlockDeltaToEvents", () => {
  it("returns no events and null state when there is no open block", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "x" },
    } as RawContentBlockDeltaEvent;
    expect(
      contentBlockDeltaToEvents(event, null, metadata, realConverters)
    ).toEqual([[], null]);
  });

  it("emits a text_delta and accumulates onto the cursor", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "lo" },
    } as RawContentBlockDeltaEvent;
    const state = { index: 0, accumulator: "hel", type: "text" as const };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      { type: "text_delta", content: { value: "lo" }, metadata },
    ]);
    expect(nextState).toEqual({ ...state, accumulator: "hello" });
  });

  it("emits a reasoning_delta and accumulates onto the cursor", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "more" },
    } as RawContentBlockDeltaEvent;
    const state = {
      index: 0,
      accumulator: "think ",
      type: "reasoning" as const,
    };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      { type: "reasoning_delta", content: { value: "more" }, metadata },
    ]);
    expect(nextState).toEqual({ ...state, accumulator: "think more" });
  });

  it("emits a tool_call_delta heartbeat and accumulates the partial JSON", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"a":' },
    } as RawContentBlockDeltaEvent;
    const state = {
      index: 0,
      accumulator: "",
      type: "tool_use" as const,
      toolId: "t",
      toolName: "n",
    };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([{ type: "tool_call_delta", metadata }]);
    expect(nextState).toEqual({ ...state, accumulator: '{"a":' });
  });

  it("accumulates a signature delta onto a reasoning cursor without emitting", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "abc" },
    } as RawContentBlockDeltaEvent;
    const state = {
      index: 0,
      accumulator: "",
      type: "reasoning" as const,
      signature: "sig-",
    };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(nextState).toEqual({ ...state, signature: "sig-abc" });
  });

  it("ignores a signature delta on a non-reasoning cursor", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "abc" },
    } as RawContentBlockDeltaEvent;
    const state = { index: 0, accumulator: "x", type: "text" as const };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(nextState).toBe(state);
  });

  it("ignores a citations delta", () => {
    const event = {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "citations_delta",
        citation: {
          type: "char_location",
          cited_text: "x",
          document_index: 0,
          document_title: null,
          start_char_index: 0,
          end_char_index: 1,
        },
      },
    } as RawContentBlockDeltaEvent;
    const state = { index: 0, accumulator: "x", type: "text" as const };
    const [events, nextState] = contentBlockDeltaToEvents(
      event,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([]);
    expect(nextState).toBe(state);
  });
});

describe("contentBlockStopToEvents", () => {
  const stopEvent = {
    type: "content_block_stop",
    index: 0,
  } as RawContentBlockStopEvent;

  it("returns no events when there is no open block", () => {
    expect(
      contentBlockStopToEvents(stopEvent, null, metadata, realConverters)
    ).toEqual([[], null]);
  });

  it("flushes a text block into a text event and clears the cursor", () => {
    const state = { index: 0, accumulator: "hello", type: "text" as const };
    expect(
      contentBlockStopToEvents(stopEvent, state, metadata, realConverters)
    ).toEqual([
      [{ type: "text", content: { value: "hello" }, metadata }],
      null,
    ]);
  });

  it("flushes a reasoning block, forwarding the accumulated signature", () => {
    const state = {
      index: 0,
      accumulator: "deep",
      type: "reasoning" as const,
      signature: "sig-9",
    };
    const [events, nextState] = contentBlockStopToEvents(
      stopEvent,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      {
        type: "reasoning",
        content: { value: "deep" },
        metadata: { ...metadata, content: { signature: "sig-9" } },
      },
    ]);
    expect(nextState).toBeNull();
  });

  it("flushes a tool_use block with valid JSON into a parsed tool_call", () => {
    const state = {
      index: 0,
      accumulator: '{"q":"cats"}',
      type: "tool_use" as const,
      toolId: "tu-1",
      toolName: "search",
    };
    const [events] = contentBlockStopToEvents(
      stopEvent,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      {
        type: "tool_call",
        content: { id: "tu-1", name: "search", arguments: { q: "cats" } },
        metadata,
      },
    ]);
  });

  it("wraps invalid tool_use JSON under INVALID_JSON", () => {
    const state = {
      index: 0,
      accumulator: '{"q": ',
      type: "tool_use" as const,
      toolId: "tu-1",
      toolName: "search",
    };
    const [events] = contentBlockStopToEvents(
      stopEvent,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      {
        type: "tool_call",
        content: {
          id: "tu-1",
          name: "search",
          arguments: { INVALID_JSON: '{"q": ' },
        },
        metadata,
      },
    ]);
  });

  it("treats an empty tool_use accumulator as a (valid) empty tool_call", () => {
    const state = {
      index: 0,
      accumulator: "",
      type: "tool_use" as const,
      toolId: "tu-1",
      toolName: "search",
    };
    const [events] = contentBlockStopToEvents(
      stopEvent,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      {
        type: "tool_call",
        content: { id: "tu-1", name: "search", arguments: {} },
        metadata,
      },
    ]);
  });

  it("skips eager validation for very large tool inputs", () => {
    // Above MAX_EAGER_VALIDATION_INPUT_LENGTH (5000), invalid JSON is not
    // wrapped — it flows through the regular tool_call converter (which parses
    // and falls back to {}).
    const accumulator = "x".repeat(5001);
    const state = {
      index: 0,
      accumulator,
      type: "tool_use" as const,
      toolId: "tu-1",
      toolName: "search",
    };
    const [events] = contentBlockStopToEvents(
      stopEvent,
      state,
      metadata,
      realConverters
    );
    expect(events).toEqual([
      {
        type: "tool_call",
        content: { id: "tu-1", name: "search", arguments: {} },
        metadata,
      },
    ]);
  });

  it("closes a tool_search block without emitting a tool_call", () => {
    const state = {
      index: 0,
      accumulator: '{"query":"send a slack message"}',
      type: "tool_search" as const,
      toolName: "tool_search_tool_bm25",
    };
    expect(
      contentBlockStopToEvents(stopEvent, state, metadata, realConverters)
    ).toEqual([[], null]);
  });
});

describe("messageDeltaToEvents", () => {
  const usage: MessageDeltaUsage = {
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    input_tokens: null,
    output_tokens: 5,
    output_tokens_details: null,
    server_tool_use: null,
  };

  it("returns no events for a benign stop reason and forwards usage", () => {
    const event = {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage,
    } as RawMessageDeltaEvent;
    expect(messageDeltaToEvents(event, metadata, realConverters)).toEqual([
      [],
      usage,
    ]);
  });

  it("emits an error event for an erroring stop reason", () => {
    const event = {
      type: "message_delta",
      delta: { stop_reason: "max_tokens", stop_sequence: null },
      usage,
    } as RawMessageDeltaEvent;
    const [events, forwardedUsage] = messageDeltaToEvents(
      event,
      metadata,
      realConverters
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ content: { type: "stop_error" } });
    expect(forwardedUsage).toBe(usage);
  });

  it("returns no events when stop_reason is absent", () => {
    const event = {
      type: "message_delta",
      delta: { stop_reason: null, stop_sequence: null },
      usage,
    } as RawMessageDeltaEvent;
    expect(messageDeltaToEvents(event, metadata, realConverters)[0]).toEqual(
      []
    );
  });
});

describe("rawOutputToEvents", () => {
  const tokenUsage: MessageDeltaUsage = {
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    input_tokens: 3,
    output_tokens: 2,
    output_tokens_details: null,
    server_tool_use: null,
  };

  it("drives a text stream into response_id, deltas, text, usage and success", async () => {
    const events = await collect(
      rawOutputToEvents(
        streamOf([
          {
            type: "message_start",
            message: { id: "msg_1" },
          } as RawMessageStartEvent,
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "", citations: [] },
          } as RawMessageStreamEvent,
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hi" },
          } as RawMessageStreamEvent,
          {
            type: "content_block_stop",
            index: 0,
          } as RawMessageStreamEvent,
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: tokenUsage,
          } as RawMessageStreamEvent,
          { type: "message_stop" } as RawMessageStreamEvent,
        ]),
        metadata,
        realConverters
      )
    );

    expect(events.map((e) => e.type)).toEqual([
      "response_id",
      "text_delta",
      "text",
      "token_usage",
      "success",
    ]);

    const success = events.find((e) => e.type === "success");
    expect(success).toMatchObject({
      content: { aggregated: [{ type: "text", content: { value: "Hi" } }] },
    });
  });

  it("splits cache creation by TTL using the cache_creation breakdown from message_start", async () => {
    // Anthropic only emits the per-TTL split on message_start; the trailing
    // message_delta usage carries the flat cache_creation_input_tokens. The
    // breakdown captured from message_start must drive the token_usage event.
    const events = await collect(
      rawOutputToEvents(
        streamOf([
          {
            type: "message_start",
            message: {
              id: "msg_1",
              usage: {
                input_tokens: 3,
                cache_creation_input_tokens: 4809,
                cache_read_input_tokens: 0,
                cache_creation: {
                  ephemeral_5m_input_tokens: 7,
                  ephemeral_1h_input_tokens: 4802,
                },
                output_tokens: 1,
              },
            },
          } as RawMessageStartEvent,
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: {
              cache_creation_input_tokens: 4809,
              cache_read_input_tokens: 0,
              input_tokens: 3,
              output_tokens: 5,
              output_tokens_details: { thinking_tokens: 0 },
              server_tool_use: null,
            },
          } as RawMessageStreamEvent,
          { type: "message_stop" } as RawMessageStreamEvent,
        ]),
        metadata,
        realConverters
      )
    );

    const tokenUsage = events.find((e) => e.type === "token_usage");
    expect(tokenUsage).toMatchObject({
      content: {
        cacheCreated: 0,
        longCacheCreated: 4802,
        shortCacheCreated: 7,
        cacheHit: 0,
        standardInput: 3,
        standardOutput: 5,
        reasoning: 0,
      },
    });
  });

  it("maps a thrown SDK error to an error event and stops", async () => {
    const events = await collect(
      rawOutputToEvents(
        streamOf(
          [
            {
              type: "message_start",
              message: { id: "msg_1" },
            } as RawMessageStartEvent,
          ],
          new APIError(429, {}, "slow down", undefined, null)
        ),
        metadata,
        realConverters
      )
    );
    expect(events.map((e) => e.type)).toEqual(["response_id", "error"]);
    expect(events[1]).toMatchObject({ content: { type: "rate_limit_error" } });
  });

  it("recovers an in-progress tool call when invalid tool JSON aborts the stream", async () => {
    const events = await collect(
      rawOutputToEvents(
        streamOf(
          [
            {
              type: "content_block_start",
              index: 0,
              content_block: {
                type: "tool_use",
                id: "tu-1",
                name: "search",
                input: {},
              },
            } as RawMessageStreamEvent,
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: "{bad" },
            } as RawMessageStreamEvent,
          ],
          new AnthropicError(INVALID_TOOL_JSON_MESSAGE)
        ),
        metadata,
        realConverters
      )
    );

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toMatchObject({
      content: {
        id: "tu-1",
        name: "search",
        arguments: { INVALID_JSON: "{bad json" },
      },
    });
    // The recovered tool_call is aggregated into the trailing success event.
    const success = events.find((e) => e.type === "success");
    expect(success).toMatchObject({
      content: { aggregated: [{ type: "tool_call" }] },
    });
  });

  it("omits the token_usage event when no message_delta carried usage", async () => {
    const events = await collect(
      rawOutputToEvents(
        streamOf([{ type: "message_stop" } as RawMessageStreamEvent]),
        metadata,
        realConverters
      )
    );
    expect(events.map((e) => e.type)).toEqual(["success"]);
  });
});

describe("messageToEvents", () => {
  function messageWith(overrides: Partial<Message>): Message {
    return {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 4,
        output_tokens: 6,
        output_tokens_details: null,
        server_tool_use: null,
      },
      ...overrides,
    } as Message;
  }

  it("converts text, thinking and tool_use blocks in order", () => {
    const message = messageWith({
      content: [
        { type: "text", text: "hello", citations: [] },
        { type: "thinking", thinking: "hmm", signature: "sig-1" },
        { type: "tool_use", id: "tu-1", name: "search", input: { q: "cats" } },
      ],
    } as Partial<Message>);

    const events = messageToEvents(message, metadata, realConverters);
    expect(events.map((e) => e.type)).toEqual([
      "response_id",
      "text",
      "reasoning",
      "tool_call_started",
      "tool_call",
      "token_usage",
      "success",
    ]);

    expect(events[4]).toMatchObject({
      content: { id: "tu-1", name: "search", arguments: { q: "cats" } },
    });
  });

  it("aggregates text, reasoning and tool_call into the success event", () => {
    const message = messageWith({
      content: [
        { type: "text", text: "hi", citations: [] },
        { type: "tool_use", id: "tu-1", name: "n", input: {} },
      ],
    } as Partial<Message>);
    const events = messageToEvents(message, metadata, realConverters);
    const success = events.find((e) => e.type === "success");
    expect(success).toMatchObject({
      content: {
        aggregated: [{ type: "text" }, { type: "tool_call" }],
      },
    });
  });

  it("appends a stop error event before token usage when stop_reason errors", () => {
    const message = messageWith({ stop_reason: "max_tokens" });
    const events = messageToEvents(message, metadata, realConverters);
    expect(events.map((e) => e.type)).toEqual([
      "response_id",
      "error",
      "token_usage",
      "success",
    ]);
  });

  it("skips block types that are not surfaced", () => {
    const message = messageWith({
      content: [{ type: "redacted_thinking", data: "xxx" }],
    } as Partial<Message>);
    const events = messageToEvents(message, metadata, realConverters);
    expect(events.map((e) => e.type)).toEqual([
      "response_id",
      "token_usage",
      "success",
    ]);
  });
});

describe("batchResultToEvents", () => {
  function succeededResult(): MessageBatchResult {
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: "ok", citations: [] }],
      stop_reason: "end_turn",
      stop_sequence: null,
      container: null,
      stop_details: null,
      usage: {
        cache_creation: null,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        inference_geo: null,
        input_tokens: 1,
        output_tokens: 1,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
      },
    } as Message;
    return { type: "succeeded", message };
  }

  it("converts a succeeded result via messageToEvents", () => {
    const events = batchResultToEvents(
      succeededResult(),
      metadata,
      realConverters
    );
    expect(events.map((e) => e.type)).toEqual([
      "response_id",
      "text",
      "token_usage",
      "success",
    ]);
  });

  it("maps an errored result to a server_error event", () => {
    const result = {
      type: "errored",
      error: {
        type: "error",
        error: { type: "api_error", message: "upstream blew up" },
      },
    } as MessageBatchResult;
    const events = batchResultToEvents(result, metadata, realConverters);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      content: { type: "server_error", message: "upstream blew up" },
    });
  });

  it("maps a canceled result to a stream_error event", () => {
    const result = { type: "canceled" } as MessageBatchResult;
    const events = batchResultToEvents(result, metadata, realConverters);
    expect(events[0]).toMatchObject({
      type: "error",
      content: { type: "stream_error" },
    });
  });

  it("maps an expired result to a stream_error event", () => {
    const result = { type: "expired" } as MessageBatchResult;
    const events = batchResultToEvents(result, metadata, realConverters);
    expect(events[0]).toMatchObject({
      type: "error",
      content: { type: "stream_error" },
    });
  });
});
