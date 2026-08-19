import { deferTerminalError } from "@app/lib/model_constructors/stream/defer_terminal_error";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "noop",
  host: "noop",
  model: "noop",
  region: "global",
};

async function* streamOf(
  events: ModelResponseEvent[]
): AsyncGenerator<ModelResponseEvent> {
  yield* events;
}

async function collect(
  events: AsyncGenerator<ModelResponseEvent>
): Promise<ModelResponseEvent[]> {
  const collected: ModelResponseEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("deferTerminalError", () => {
  it("drains usage before emitting the first terminal error", async () => {
    const error = {
      type: "error" as const,
      content: { type: "stop_error" as const, message: "max tokens" },
      metadata,
    };
    const usage = {
      type: "token_usage" as const,
      content: {
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheCreated: 0,
        cacheHit: 0,
        standardInput: 100,
        totalOutput: 20,
      },
      metadata,
    };
    const success = {
      type: "success" as const,
      content: { aggregated: [] },
      metadata,
    };

    const events = await collect(
      deferTerminalError(streamOf([error, usage, success]))
    );

    expect(events).toEqual([usage, error]);
  });

  it("leaves a successful stream unchanged", async () => {
    const success = {
      type: "success" as const,
      content: { aggregated: [] },
      metadata,
    };

    await expect(
      collect(deferTerminalError(streamOf([success])))
    ).resolves.toEqual([success]);
  });
});
