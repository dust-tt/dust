import type {
  BetaMessage,
  BetaRawContentBlockDeltaEvent,
  BetaRawContentBlockStartEvent,
  BetaRawContentBlockStopEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { OutputEventConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  accumulatedToolCallToToolCallEvent,
  contentBlockDeltaToEvents,
  contentBlockStartToEvents,
  contentBlockStopToEvents,
  inputJsonDeltaToToolCallDeltaEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaUsageToTokenUsageEvent,
  messageStartToResponseIdEvent,
  messageToEvents,
  reasoningDeltaToReasoningDeltaEvent,
  serverToolBlockToProviderPassthroughEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  toolUseBlockStartToToolCallStartedEvent,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "anthropic",
  host: "anthropic",
  region: "us",
  model: "claude-sonnet-4-6",
};

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
  serverToolBlockToProviderPassthroughEvent,
  messageDeltaUsageToTokenUsageEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
};

const searchResult = {
  type: "web_search_result" as const,
  url: "https://example.com/wc",
  title: "World Cup",
  encrypted_content: "opaque",
  page_age: null,
};

describe("contentBlockStartToEvents for native web search", () => {
  it("opens a native_web_search cursor for a web_search server_tool_use", () => {
    const event = {
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "server_tool_use",
        id: "srvtoolu_1",
        name: "web_search",
        input: {},
      },
    } as BetaRawContentBlockStartEvent;

    const [events, nextState] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );

    expect(events).toEqual([]);
    expect(nextState).toEqual({
      index: 2,
      accumulator: "",
      type: "native_web_search",
      toolId: "srvtoolu_1",
    });
  });

  // Guard against the web-search branch swallowing tool search.
  it("still opens a tool_search cursor for a tool search server_tool_use", () => {
    const event = {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "server_tool_use",
        id: "srvtoolu_2",
        name: "tool_search_tool_bm25",
        input: {},
      },
    } as BetaRawContentBlockStartEvent;

    const [, nextState] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );

    expect(nextState).toMatchObject({
      type: "tool_search",
      toolName: "tool_search_tool_bm25",
    });
  });

  it("passes a web_search_tool_result through for verbatim replay", () => {
    const event = {
      type: "content_block_start",
      index: 3,
      content_block: {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [searchResult],
      },
    } as BetaRawContentBlockStartEvent;

    const [events, nextState] = contentBlockStartToEvents(
      event,
      null,
      metadata,
      realConverters
    );

    expect(events).toEqual([
      {
        type: "provider_passthrough",
        content: {
          provider: "anthropic",
          block: {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [searchResult],
          },
        },
        metadata,
      },
    ]);
    expect(nextState).toBeNull();
  });
});

describe("contentBlockStopToEvents for native web search", () => {
  const stopEvent = {
    type: "content_block_stop",
    index: 2,
  } as BetaRawContentBlockStopEvent;

  it("emits the server_tool_use block with the parsed query", () => {
    const [events, nextState] = contentBlockStopToEvents(
      stopEvent,
      {
        index: 2,
        accumulator: '{"query":"who won the last world cup"}',
        type: "native_web_search",
        toolId: "srvtoolu_1",
      },
      metadata,
      realConverters
    );

    expect(events).toEqual([
      {
        type: "provider_passthrough",
        content: {
          provider: "anthropic",
          block: {
            type: "server_tool_use",
            id: "srvtoolu_1",
            name: "web_search",
            input: { query: "who won the last world cup" },
          },
        },
        metadata,
      },
    ]);
    expect(nextState).toBeNull();
  });

  it("falls back to an empty input when the query fails to parse", () => {
    const [events] = contentBlockStopToEvents(
      stopEvent,
      {
        index: 2,
        accumulator: '{"query":',
        type: "native_web_search",
        toolId: "srvtoolu_1",
      },
      metadata,
      realConverters
    );

    expect(events[0]).toMatchObject({
      content: { block: { input: {} } },
    });
  });
});

describe("contentBlockDeltaToEvents for web search citations", () => {
  function citationDelta(): BetaRawContentBlockDeltaEvent {
    return {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "citations_delta",
        citation: {
          type: "web_search_result_location",
          cited_text: "Argentina won",
          encrypted_index: "idx",
          title: "World Cup",
          url: "https://example.com/wc",
        },
      },
    } as BetaRawContentBlockDeltaEvent;
  }

  // The link is emitted as a delta AND appended to the accumulator, so the final
  // aggregated text is byte-identical to what the user saw stream past.
  it("emits the source as a markdown link and extends the accumulator", () => {
    const [events, nextState] = contentBlockDeltaToEvents(
      citationDelta(),
      { index: 0, accumulator: "Argentina won", type: "text" },
      metadata,
      realConverters
    );

    const link = " ([World Cup](https://example.com/wc))";
    expect(events).toEqual([
      { type: "text_delta", content: { value: link }, metadata },
    ]);
    expect(nextState).toEqual({
      index: 0,
      accumulator: "Argentina won" + link,
      type: "text",
    });
  });

  it("suppresses a citation repeated immediately after itself", () => {
    const link = " ([World Cup](https://example.com/wc))";
    const state = {
      index: 0,
      accumulator: "Argentina won" + link,
      type: "text" as const,
    };

    const [events, nextState] = contentBlockDeltaToEvents(
      citationDelta(),
      state,
      metadata,
      realConverters
    );

    expect(events).toEqual([]);
    expect(nextState).toBe(state);
  });

  it("ignores a non-web-search citation", () => {
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
    } as BetaRawContentBlockDeltaEvent;
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

  it("ignores a web-search citation outside a text block", () => {
    const state = {
      index: 0,
      accumulator: "",
      type: "reasoning" as const,
    };

    const [events, nextState] = contentBlockDeltaToEvents(
      citationDelta(),
      state,
      metadata,
      realConverters
    );

    expect(events).toEqual([]);
    expect(nextState).toBe(state);
  });
});

describe("messageToEvents for native web search", () => {
  function messageWith(overrides: Partial<BetaMessage>): BetaMessage {
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
    } as BetaMessage;
  }

  it("passes both web search blocks through and appends citation links", () => {
    const message = messageWith({
      content: [
        {
          type: "server_tool_use",
          id: "srvtoolu_1",
          name: "web_search",
          input: { query: "q" },
          caller: { type: "direct" },
        },
        {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_1",
          content: [searchResult],
          caller: { type: "direct" },
        },
        {
          type: "text",
          text: "Argentina won.",
          citations: [
            {
              type: "web_search_result_location",
              cited_text: "Argentina won",
              encrypted_index: "idx",
              title: "World Cup",
              url: "https://example.com/wc",
            },
          ],
        },
      ],
    } as Partial<BetaMessage>);

    const events = messageToEvents(message, metadata, realConverters);

    expect(
      events.filter((event) => event.type === "provider_passthrough")
    ).toHaveLength(2);

    expect(events.find((event) => event.type === "text")).toMatchObject({
      content: {
        value: "Argentina won. ([World Cup](https://example.com/wc))",
      },
    });
  });

  it("leaves a text block with no web search citations untouched", () => {
    const message = messageWith({
      content: [{ type: "text", text: "plain", citations: [] }],
    } as Partial<BetaMessage>);

    const events = messageToEvents(message, metadata, realConverters);

    expect(events.find((event) => event.type === "text")).toMatchObject({
      content: { value: "plain" },
    });
  });
});
