import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import * as openai_to_events from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import { functionCallLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/function_call";
import { reasoningLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/reasoning";
import { functionCallModelEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/function_call";
import { reasoningModelOutput } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/reasoning";
import type {
  ResponseCompletedEvent,
  ResponseUsage,
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

  it("splits standard input, cache reads, and cache writes", async () => {
    const completedEvent = functionCallModelEvents.find(
      (event): event is ResponseCompletedEvent =>
        event.type === "response.completed"
    );
    expect(completedEvent).toBeDefined();
    if (!completedEvent) {
      return;
    }

    const usage: ResponseUsage = {
      input_tokens: 2006,
      input_tokens_details: {
        cached_tokens: 1200,
        cache_write_tokens: 720,
      },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 50 },
      total_tokens: 2306,
    };
    const responseCompletedEvent: ResponseCompletedEvent = {
      ...completedEvent,
      response: {
        ...completedEvent.response,
        usage,
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

    expect(result.find((event) => event.type === "token_usage")).toEqual({
      type: "token_usage",
      content: {
        inputTokens: 2006,
        cachedTokens: 1200,
        cacheCreationTokens: 720,
        uncachedInputTokens: 86,
        reasoningTokens: 50,
        outputTokens: 300,
        totalTokens: 2306,
      },
      metadata,
    });
  });
});
