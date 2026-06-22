import type {
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";
import { WithAnthropicClaudeOpusFourDotSevenConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_dot_seven";
import type { AnthropicOpusInputConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicGlobalClaudeOpusFourDotSevenStream extends WithAnthropicClaudeOpusFourDotSevenConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing (verify before launch).
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

AnthropicGlobalClaudeOpusFourDotSevenStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
  AnthropicOpusInputConfig
>;
