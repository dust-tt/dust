import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeHaikuFiveDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_five_dot_five";
import { WithAnthropicClaudeHaikuFiveDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_five_dot_five";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream extends WithAnthropicClaudeHaikuFiveDotFiveConfig(
  AnthropicStream
) {
  // Prompts up to 100k tokens; prompts over that pay 5x on every rate, which
  // `TokenPricing` cannot express (see `MODEL_PRICING` for both tiers).
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-10-08).
  static readonly tokenPricing = {
    cacheCreated: 0.125,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 0.125,
    longCacheCreated: 0.2,
    cacheHit: 0.01,
    standardInput: 0.1,
    standardOutput: 0.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeHaikuFiveDotFive
>;
