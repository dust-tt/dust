import type {
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";
import {
  type ClaudeOpusFourDotEight,
  WithAnthropicClaudeOpusFourDotEightConfig,
} from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_dot_eight";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicGlobalClaudeOpusFourDotEightStream extends WithAnthropicClaudeOpusFourDotEightConfig(
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

AnthropicGlobalClaudeOpusFourDotEightStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
  ClaudeOpusFourDotEight
>;
