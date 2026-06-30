import { WithAnthropicClaudeSonnetFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
import { AgentPlatformStream } from "@app/lib/model_constructors/stream/clients/agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AgentPlatformEuropeClaudeSonnetFiveStream extends WithAnthropicClaudeSonnetFiveConfig(
  AgentPlatformStream
) {
  // https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/sonnet-5
  // Anthropic charges a 10% surcharge on Vertex AI EU inference.
  // TODO(2026-08-31): intro pricing ends; revert to standard rates
  // (standardInput 3.3, standardOutput 16.5, cacheCreated/shortCacheCreated
  // 4.13, longCacheCreated 6.6, cacheHit 0.33).
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
