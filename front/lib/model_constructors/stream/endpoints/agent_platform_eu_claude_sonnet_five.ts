import { WithAnthropicClaudeSonnetFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AgentPlatformEuropeClaudeSonnetFiveStream extends WithAnthropicClaudeSonnetFiveConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 2.75,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 2.75,
    longCacheCreated: 4.4,
    cacheHit: 0.22,
    standardInput: 2.2,
    standardOutput: 11.0,
  };
  static readonly region = "eu";
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AgentPlatformEuropeClaudeSonnetFiveStream satisfies StreamEndpointConstructor;
