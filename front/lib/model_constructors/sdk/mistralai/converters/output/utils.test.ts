import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import { expectStreamEventContract } from "@app/lib/model_constructors/test/stream_event_contract";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  CompletionEvent,
  CompletionResponseStreamChoice,
  UsageInfo,
} from "@mistralai/mistralai/models/components";
import { CompletionResponseStreamChoiceFinishReason } from "@mistralai/mistralai/models/components";
import { describe, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "mistral",
  host: "mistral",
  model: "mistral-large-latest",
  region: "eu",
};

function makeEvent(
  choices: CompletionResponseStreamChoice[],
  usage?: UsageInfo
): CompletionEvent {
  return {
    data: {
      id: "completion_123",
      model: "mistral-large-latest",
      choices,
      usage,
    },
  };
}

describe("rawOutputToEvents", () => {
  it("drains trailing usage before emitting a finish error", async () => {
    const rawEvents = [
      makeEvent([
        {
          index: 0,
          delta: {},
          finishReason: CompletionResponseStreamChoiceFinishReason.Length,
        },
      ]),
      makeEvent([], {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      }),
    ];

    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator(rawEvents),
      metadata
    )) {
      events.push(event);
    }

    expectStreamEventContract(events, {
      terminalType: "error",
      usageExpected: true,
    });
  });

  it("does not synthesize zero usage when the provider omits it", async () => {
    const rawEvents = [
      makeEvent([
        {
          index: 0,
          delta: {},
          finishReason: CompletionResponseStreamChoiceFinishReason.Stop,
        },
      ]),
    ];

    const events = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator(rawEvents),
      metadata
    )) {
      events.push(event);
    }

    expectStreamEventContract(events, {
      terminalType: "success",
      usageExpected: false,
    });
  });
});
