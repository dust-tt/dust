import { WithAnthropicClaudeHaikuFourDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_four_dot_five";
import { AgentPlatformStream } from "@app/lib/model_constructors/stream/clients/agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AgentPlatformEuropeClaudeHaikuFourDotFiveStream extends WithAnthropicClaudeHaikuFourDotFiveConfig(
  AgentPlatformStream
) {
  // Vertex expects the dated id; our canonical `modelId` is the dateless alias.
  static readonly providerModelId = "claude-haiku-4-5@20251001";

  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 1.375,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 1.375,
    longCacheCreated: 2.2,
    cacheHit: 0.11,
    standardInput: 1.1,
    standardOutput: 5.5,
  };
  static readonly region = "eu";
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AgentPlatformEuropeClaudeHaikuFourDotFiveStream satisfies StreamEndpointConstructor;
