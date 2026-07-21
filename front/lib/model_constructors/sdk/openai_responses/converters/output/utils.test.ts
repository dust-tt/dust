import * as converters from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { outputItemToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "openai",
  host: "openai-responses",
  model: "gpt-5.4",
  region: "global",
} as const;

describe("outputItemToEvents", () => {
  it("preserves a discovered function call namespace", () => {
    const item = {
      type: "function_call",
      id: "fc_123",
      call_id: "call_123",
      name: "get_weather",
      namespace: "weather",
      arguments: "{}",
      status: "completed",
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "tool_call",
        content: {
          id: "call_123",
          name: "get_weather",
          arguments: {},
          namespace: "weather",
        },
        metadata,
      },
    ]);
  });

  it.each<ResponseOutputItem>([
    {
      type: "tool_search_call",
      id: "ts_123",
      call_id: null,
      execution: "server",
      status: "completed",
      arguments: { paths: ["weather"] },
    },
    {
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
    },
  ])("preserves $type as provider passthrough", (item) => {
    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "provider_passthrough",
        content: { provider: "openai", block: item },
        metadata,
      },
    ]);
  });
});
