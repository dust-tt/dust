import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import * as openai_to_events from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import { functionCallLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/function_call";
import { reasoningLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/reasoning";
import { functionCallModelEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/function_call";
import { reasoningModelOutput } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/reasoning";
import type {
  ResponseCompletedEvent,
  ResponseOutputItem,
} from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const metadata = {
  clientId: "openai",
  inferenceProvider: "openai",
  inferenceRegion: "global",
  modelId: "gpt-5",
} as const;

describe("streamLLMEvents", () => {
  it("should convert events with tool calls", async () => {
    const responseStreamEvents = createAsyncGenerator(functionCallModelEvents);
    const result = [];

    for await (const event of openai_to_events.streamLLMEvents(
      responseStreamEvents,
      metadata
    )) {
      result.push(event);
    }

    expect(result).toEqual(functionCallLLMEvents);
  });
  it("should convert events with reasoning", async () => {
    const responseStreamEvents = createAsyncGenerator(reasoningModelOutput);
    const result = [];

    for await (const event of openai_to_events.streamLLMEvents(
      responseStreamEvents,
      metadata
    )) {
      result.push(event);
    }

    expect(result).toEqual(reasoningLLMEvents);
  });

  it("preserves a discovered function call namespace", async () => {
    const completedEvent = functionCallModelEvents.find(
      (event): event is ResponseCompletedEvent =>
        event.type === "response.completed"
    );
    expect(completedEvent).toBeDefined();
    if (!completedEvent) {
      return;
    }

    const functionCall = {
      type: "function_call",
      id: "fc_123",
      call_id: "call_123",
      name: "get_weather",
      namespace: "weather",
      arguments: "{}",
      status: "completed",
    } satisfies ResponseOutputItem;
    const responseStreamEvents = createAsyncGenerator([
      {
        ...completedEvent,
        response: {
          ...completedEvent.response,
          output: [functionCall],
          usage: undefined,
        },
      },
    ]);
    const result = [];

    for await (const event of openai_to_events.streamLLMEvents(
      responseStreamEvents,
      metadata
    )) {
      result.push(event);
    }

    expect(result[0]).toEqual({
      type: "tool_call",
      content: {
        id: "call_123",
        name: "get_weather",
        arguments: {},
        namespace: "weather",
      },
      metadata,
    });
  });

  it("preserves hosted tool-search items for replay", async () => {
    const completedEvent = functionCallModelEvents.find(
      (event): event is ResponseCompletedEvent =>
        event.type === "response.completed"
    );
    expect(completedEvent).toBeDefined();
    if (!completedEvent) {
      return;
    }

    const toolSearchCall = {
      type: "tool_search_call",
      id: "ts_123",
      call_id: null,
      execution: "server",
      status: "completed",
      arguments: { paths: ["weather"] },
    } satisfies ResponseOutputItem;
    const toolSearchOutput = {
      type: "tool_search_output",
      id: "tso_123",
      call_id: null,
      execution: "server",
      status: "completed",
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get the current weather",
          parameters: { type: "object", properties: {} },
          strict: false,
          defer_loading: true,
        },
      ],
    } satisfies ResponseOutputItem;
    const responseCompletedEvent: ResponseCompletedEvent = {
      ...completedEvent,
      response: {
        ...completedEvent.response,
        output: [toolSearchCall, toolSearchOutput],
        usage: undefined,
      },
    };
    const responseStreamEvents = createAsyncGenerator([responseCompletedEvent]);
    const result = [];

    for await (const event of openai_to_events.streamLLMEvents(
      responseStreamEvents,
      metadata
    )) {
      result.push(event);
    }

    expect(result).toEqual([
      {
        type: "provider_passthrough",
        content: { provider: "openai", block: toolSearchCall },
        metadata,
      },
      {
        type: "provider_passthrough",
        content: { provider: "openai", block: toolSearchOutput },
        metadata,
      },
      {
        type: "success",
        aggregated: [],
        textGenerated: undefined,
        reasoningGenerated: undefined,
        toolCalls: undefined,
        metadata,
      },
    ]);
  });
});
