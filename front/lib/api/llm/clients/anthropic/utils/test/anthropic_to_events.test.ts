import { describe, expect, it } from "vitest";

import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import { emptyToolCallLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/empty_tool_call";
import { reasoningLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/reasoning";
import { toolUseLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/tool_use";
import { emptyToolCallModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/empty_tool_call";
import { reasoningModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/reasoning";
import { toolUseModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/tool_use";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

const metadata: LLMClientMetadata = {
  clientId: "anthropic" as const,
  modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
};

describe("streamLLMEvents", () => {
  it("should convert tool use events", async () => {
    const messageStreamEvents = createAsyncGenerator(toolUseModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(toolUseLLMEvents.map((e) => ({ ...e, metadata })));
  });

  it("should convert reasoning/thinking events", async () => {
    const messageStreamEvents = createAsyncGenerator(reasoningModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(
      reasoningLLMEvents.map((e) => ({
        ...e,
        metadata: { ...e.metadata, ...metadata },
      }))
    );
  });

  it("should handle empty tool call parameters", async () => {
    const messageStreamEvents = createAsyncGenerator(emptyToolCallModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(
      emptyToolCallLLMEvents.map((e) => ({ ...e, metadata }))
    );
  });
});
