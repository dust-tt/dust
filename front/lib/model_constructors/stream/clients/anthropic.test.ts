// @vitest-environment node

import assert from "node:assert";

import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { THINKING_BINDING_CONTROLS_BETA_HEADER } from "@app/lib/model_constructors/stream/clients/anthropic";
import { AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_dot_five_global_anthropic";
import { AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { describe, expect, it, vi } from "vitest";

// The real Vertex constructor starts Google credential discovery even without an API call.
vi.mock("@anthropic-ai/vertex-sdk", () => ({ default: vi.fn() }));

describe("AnthropicStream", () => {
  it("disables SDK retries so the agent loop owns retry attempts", () => {
    const endpoint = new AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream({
      ANTHROPIC_API_KEY: "test-key",
    });

    expect(Reflect.get(endpoint, "client")).toMatchObject({ maxRetries: 0 });
  });

  it("disables Vertex SDK retries so the agent loop owns retry attempts", () => {
    new AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream({
      AGENT_PLATFORM_PROJECT_ID: "test-project",
    });

    expect(AnthropicVertex).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 })
    );
  });
});

const EMPTY_PAYLOAD = { conversation: { system: [], messages: [] } };

function createSonnetFiveDotFive() {
  return new AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream({
    ANTHROPIC_API_KEY: "test-key",
  });
}

function createSonnetFiveDotFiveStartingWith(message: Record<string, unknown>) {
  const endpoint = createSonnetFiveDotFive();
  Reflect.set(endpoint, "client", {
    beta: {
      messages: {
        stream: async function* () {
          yield {
            type: "message_start",
            message: {
              id: "msg_123",
              usage: { input_tokens: 1, output_tokens: 0 },
              ...message,
            },
          };
        },
      },
    },
  });
  return endpoint;
}

async function collectResponseIdEvent(
  endpoint: AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream
) {
  const request = await endpoint.buildRequestPayload(
    EMPTY_PAYLOAD,
    AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream.configSchema.parse({})
  );
  for await (const event of endpoint.rawStreamOutputToEvents(
    endpoint.streamRaw(request)
  )) {
    if (event.type === "response_id") {
      return event;
    }
  }
  return undefined;
}

describe("AnthropicStream thinking-binding observability", () => {
  it("sends the thinking-binding beta by default", async () => {
    const payload = await createSonnetFiveDotFive().buildRequestPayload(
      EMPTY_PAYLOAD,
      AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream.configSchema.parse(
        {}
      )
    );

    expect(payload.betas).toEqual([THINKING_BINDING_CONTROLS_BETA_HEADER]);
    expect(payload.thinking).not.toHaveProperty("block_binding");
  });

  it("sends no betas when an endpoint overrides them away", async () => {
    class WithoutBetas extends AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream {
      protected readonly betas: readonly string[] = [];
    }
    const payload = await new WithoutBetas({
      ANTHROPIC_API_KEY: "test-key",
    }).buildRequestPayload(
      EMPTY_PAYLOAD,
      AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream.configSchema.parse(
        {}
      )
    );

    expect(payload.betas).toBeUndefined();
  });

  it("sends the thinking-binding beta alongside the cache-diagnostics beta", async () => {
    const payload = await createSonnetFiveDotFive().buildRequestPayload(
      EMPTY_PAYLOAD,
      AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream.configSchema.parse({
        previousMessageId: null,
      })
    );

    expect(payload.betas).toEqual([
      "cache-diagnosis-2026-04-07",
      THINKING_BINDING_CONTROLS_BETA_HEADER,
    ]);
  });

  it("attaches message_start input transformations to the response id event", async () => {
    const endpoint = createSonnetFiveDotFiveStartingWith({
      input_transformations: [
        {
          type: "thinking_mismatch_allowed",
          path: "messages.1.content.0",
          reason: "prefix_binding_mismatch",
        },
      ],
    });

    const event = await collectResponseIdEvent(endpoint);

    assert(event, "expected a response_id event");
    expect(event.metadata.content?.inputTransformations).toEqual([
      {
        type: "thinking_mismatch_allowed",
        path: "messages.1.content.0",
        reason: "prefix_binding_mismatch",
      },
    ]);
  });

  it("leaves the response id event untouched when nothing was transformed", async () => {
    const endpoint = createSonnetFiveDotFiveStartingWith({
      input_transformations: [],
    });

    const event = await collectResponseIdEvent(endpoint);

    assert(event, "expected a response_id event");
    expect(event.metadata.content?.inputTransformations).toBeUndefined();
  });
});
