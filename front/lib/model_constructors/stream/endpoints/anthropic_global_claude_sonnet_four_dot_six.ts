import type {
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";
import {
  type ClaudeSonnetFourDotSix,
  WithAnthropicClaudeSonnetFourDotSixConfig,
} from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicGlobalClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 3.75,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 3.75,
    longCacheCreated: 6.0,
    cacheHit: 0.3,
    standardInput: 3.0,
    standardOutput: 15.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
  ClaudeSonnetFourDotSix
>;
