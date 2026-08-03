import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { WithAnthropicClaudeOpusFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five";
import type { AnthropicOpusInputConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeOpusFiveGlobalAnthropicStream extends WithAnthropicClaudeOpusFiveConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 6.25,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 6.25,
    longCacheCreated: 10.0,
    cacheHit: 0.5,
    standardInput: 5.0,
    standardOutput: 25.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeOpusFiveGlobalAnthropicStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  AnthropicOpusInputConfig
>;
