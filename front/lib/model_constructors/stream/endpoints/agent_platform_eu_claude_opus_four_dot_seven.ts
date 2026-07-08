import { WithAnthropicClaudeOpusFourDotSevenConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_dot_seven";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AgentPlatformEuropeClaudeOpusFourDotSevenStream extends WithAnthropicClaudeOpusFourDotSevenConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 6.88,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 6.88,
    longCacheCreated: 11.0,
    cacheHit: 0.55,
    standardInput: 5.5,
    standardOutput: 27.5,
  };
  static readonly region = "eu";
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AgentPlatformEuropeClaudeOpusFourDotSevenStream satisfies StreamEndpointConstructor;
