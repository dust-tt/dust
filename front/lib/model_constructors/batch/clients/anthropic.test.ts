// @vitest-environment node

import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { MID_CONVERSATION_OUTPUT_CONFIG_BETA_HEADER } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import type { BaseMessage } from "@app/lib/model_constructors/types/input/messages";
import { describe, expect, it, vi } from "vitest";

const CONFIG =
  AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch.configSchema.parse({
    reasoning: { effort: "medium" },
  });

const TURN: BaseMessage[] = [
  { role: "user", type: "text", content: { value: "Plan a migration." } },
  { role: "assistant", type: "text", content: { value: "Export, import." } },
  { role: "user", type: "text", content: { value: "Summarize it." } },
];

const EFFORT_CHANGE: BaseMessage = {
  role: "system",
  type: "effort_change",
  content: { effort: "high" },
};

function createBatchWithFakeClient() {
  const endpoint = new AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch({
    ANTHROPIC_API_KEY: "test-key",
  });
  const create = vi.fn(async () => ({ id: "batch_123" }));
  Reflect.set(endpoint, "client", {
    beta: { messages: { batches: { create } } },
  });
  return { endpoint, create };
}

describe("AnthropicBatch per-message reasoning effort", () => {
  it("sends no beta when no request has an effort change", async () => {
    const { endpoint, create } = createBatchWithFakeClient();

    await endpoint.sendBatch(
      new Map([
        [
          "request_1",
          {
            payload: { conversation: { system: [], messages: TURN } },
            config: CONFIG,
          },
        ],
      ])
    );

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ betas: expect.anything() })
    );
  });

  it("sends the beta when a request has an effort change", async () => {
    const { endpoint, create } = createBatchWithFakeClient();

    await endpoint.sendBatch(
      new Map([
        [
          "request_1",
          {
            payload: { conversation: { system: [], messages: TURN } },
            config: CONFIG,
          },
        ],
        [
          "request_2",
          {
            payload: {
              conversation: {
                system: [],
                messages: [TURN[0], TURN[1], EFFORT_CHANGE, TURN[2]],
              },
            },
            config: CONFIG,
          },
        ],
      ])
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        betas: [MID_CONVERSATION_OUTPUT_CONFIG_BETA_HEADER],
      })
    );
  });
});
