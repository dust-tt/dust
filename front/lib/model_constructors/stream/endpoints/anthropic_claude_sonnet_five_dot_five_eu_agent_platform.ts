import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeSonnetFiveDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five_dot_five";
import { WithAnthropicClaudeSonnetFiveDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five_dot_five";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStream extends WithAnthropicClaudeSonnetFiveDotFiveConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-10-08).
  static readonly tokenPricing = {
    cacheCreated: 2.75,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 2.75,
    longCacheCreated: 4.4,
    // Cache reads are 0.05x base input on Sonnet 5.5, not the usual 0.1x.
    cacheHit: 0.11,
    standardInput: 2.2,
    standardOutput: 11.0,
  };

  static readonly region = EUROPE;
  // The `eu` multi-region endpoint, not a single region: Agent Platform serves
  // models newer than Sonnet 4.6 on global and multi-region endpoints only.
  // https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai (2026-09-28).
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AnthropicClaudeSonnetFiveDotFiveEuropeAgentPlatformStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeSonnetFiveDotFive
>;
