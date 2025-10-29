import { describe, expect, it } from "vitest";

import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import { toolUseLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/tool_use";
import { toolUseModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/tool_use";
import type { ProviderMetadata } from "@app/lib/api/llm/types/events";
import { createAsyncGenerator } from "@app/lib/api/llm/utils/utils";

const metadata: ProviderMetadata = {
  providerId: "anthropic" as const,
  modelId: "claude-sonnet-4-20250514",
};

describe("streamLLMEvents", () => {
  it("should convert modelOutputEvents to finishLLMEvents", async () => {
    const messageStreamEvents = createAsyncGenerator(toolUseModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    metadata["messageId"] = "msg_017KE6ziN29Ks5KyL3jGE7RR";

    expect(result).toEqual(toolUseLLMEvents.map((e) => ({ ...e, metadata })));
  });
});
