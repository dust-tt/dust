// @vitest-environment node

import AnthropicVertex from "@anthropic-ai/vertex-sdk";
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
