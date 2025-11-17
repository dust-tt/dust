import { describe, expect, it } from "vitest";

import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import * as openai_to_events from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import { functionCallLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/function_call";
import { reasoningLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/llm_events/reasoning";
import { functionCallModelEvents } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/function_call";
import { reasoningModelOutput } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_output/reasoning";

const metadata = {
  clientId: "openai_responses",
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
});
