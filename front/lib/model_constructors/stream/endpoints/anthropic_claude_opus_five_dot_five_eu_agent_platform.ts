import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeOpusFiveDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five_dot_five";
import { WithAnthropicClaudeOpusFiveDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five_dot_five";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream extends WithAnthropicClaudeOpusFiveDotFiveConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-09-22).
  static readonly tokenPricing = {
    cacheCreated: 5.5,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 5.5,
    longCacheCreated: 8.8,
    // Cache reads are 0.05x base input on Opus 5.5, not the usual 0.1x.
    cacheHit: 0.22,
    standardInput: 4.4,
    standardOutput: 22.0,
  };

  static readonly region = EUROPE;
  // The `eu` multi-region endpoint, not a single region: Agent Platform serves
  // models newer than Sonnet 4.6 on global and multi-region endpoints only.
  // https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai (2026-09-22).
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeOpusFiveDotFive
>;
