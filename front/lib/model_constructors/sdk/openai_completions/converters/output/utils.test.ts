import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import {
  collectStreamEvents,
  expectStreamEventContract,
} from "@app/lib/model_constructors/test/stream_event_contract";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { describe, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "deepseek",
  host: "fireworks",
  model: "deepseek-v4-pro",
  region: "global",
};

function makeChunk(
  choices: ChatCompletionChunk["choices"],
  usage?: ChatCompletionChunk["usage"]
): ChatCompletionChunk {
  return {
    id: "chatcmpl_123",
    choices,
    created: 0,
    model: "accounts/fireworks/models/deepseek-v4-pro",
    object: "chat.completion.chunk",
    usage,
  };
}

describe("rawOutputToEvents", () => {
  it("drains the trailing usage chunk before emitting a finish error", async () => {
    const rawEvents = [
      makeChunk([
        {
          index: 0,
          delta: {},
          finish_reason: "length",
        },
      ]),
      makeChunk([], {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      }),
    ];

    const events = await collectStreamEvents(
      rawOutputToEvents(createAsyncGenerator(rawEvents), metadata)
    );

    expectStreamEventContract(events, {
      terminalType: "error",
      usageExpected: true,
    });
  });

  it("does not synthesize zero usage when the provider omits it", async () => {
    const rawEvents = [
      makeChunk([
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ]),
    ];

    const events = await collectStreamEvents(
      rawOutputToEvents(createAsyncGenerator(rawEvents), metadata)
    );

    expectStreamEventContract(events, {
      terminalType: "success",
      usageExpected: false,
    });
  });
});
