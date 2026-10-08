import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeHaikuFiveDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_five_dot_five";
import { WithAnthropicClaudeHaikuFiveDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_five_dot_five";
import { AnthropicAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/anthropic_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream extends WithAnthropicClaudeHaikuFiveDotFiveConfig(
  AnthropicAgentPlatformStream
) {
  // Vertex regional/multi-region endpoints add a 10% premium over global.
  // Prompts up to 100k tokens; see `MODEL_PRICING` for the >100k tier.
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-10-08).
  static readonly tokenPricing = {
    cacheCreated: 0.1375,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 0.1375,
    longCacheCreated: 0.22,
    cacheHit: 0.011,
    standardInput: 0.11,
    standardOutput: 0.55,
  };

  static readonly region = EUROPE;
  // The `eu` multi-region endpoint, not a single region: Agent Platform serves
  // models newer than Sonnet 4.6 on global and multi-region endpoints only.
  // https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai (2026-10-08).
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

AnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeHaikuFiveDotFive
>;
