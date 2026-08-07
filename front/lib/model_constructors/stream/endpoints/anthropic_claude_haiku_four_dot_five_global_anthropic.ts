import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeHaikuFourDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_four_dot_five";
import { WithAnthropicClaudeHaikuFourDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_haiku_four_dot_five";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream extends WithAnthropicClaudeHaikuFourDotFiveConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 1.25,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 1.25,
    longCacheCreated: 2.0,
    cacheHit: 0.1,
    standardInput: 1.0,
    standardOutput: 5.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeHaikuFourDotFive
>;
