import { describe, expect, it } from "vitest";

import {
  finishStopLLMEvents,
  finishToolCallLLMEvents,
  metadata,
  modelOutputFinishStopEvents,
  modelOutputFinishToolCallEvents,
} from "@app/lib/api/llm/clients/mistral/utils/test/fixtures.test";

import { streamLLMEvents } from "../mistral_to_events";

async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("streamLLMEvents", () => {
  describe("when finish reason is stop", () => {
    it("should convert modelOutputFinishStopEvents to finishStopLLMEvents", async () => {
      const completionEvents = createAsyncGenerator(
        modelOutputFinishStopEvents
      );
      const result = [];

      for await (const event of streamLLMEvents({
        completionEvents,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        finishStopLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });

  describe("when finish reason is tool_calls", () => {
    it("should convert modelOutputFinishToolCallEvents to finishToolCallLLMEvents", async () => {
      const completionEvents = createAsyncGenerator(
        modelOutputFinishToolCallEvents
      );
      const result = [];

      for await (const event of streamLLMEvents({
        completionEvents,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        finishToolCallLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });
});
