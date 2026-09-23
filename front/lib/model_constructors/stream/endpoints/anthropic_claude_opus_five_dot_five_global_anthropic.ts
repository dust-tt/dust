import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeOpusFiveDotFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five_dot_five";
import { WithAnthropicClaudeOpusFiveDotFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five_dot_five";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream extends WithAnthropicClaudeOpusFiveDotFiveConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-09-22).
  static readonly tokenPricing = {
    cacheCreated: 5.0,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 5.0,
    longCacheCreated: 8.0,
    // Cache reads are 0.05x base input on Opus 5.5, not the usual 0.1x.
    cacheHit: 0.2,
    standardInput: 4.0,
    standardOutput: 20.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeOpusFiveDotFive
>;
