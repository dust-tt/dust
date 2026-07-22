import { WithAnthropicClaudeFableFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_fable_five";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AnthropicClaudeFableFiveEuropeAgentPlatformStream extends WithAnthropicClaudeFableFiveConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 13.75,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 13.75,
    longCacheCreated: 22.0,
    cacheHit: 1.1,
    standardInput: 11.0,
    standardOutput: 55.0,
  };
  static readonly region = "eu";
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AnthropicClaudeFableFiveEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
