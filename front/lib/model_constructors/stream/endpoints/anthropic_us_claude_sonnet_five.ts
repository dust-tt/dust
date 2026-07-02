import type {
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";
import {
  type ClaudeSonnetFive,
  WithAnthropicClaudeSonnetFiveConfig,
} from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { US } from "@app/lib/model_constructors/types/regions";

export class AnthropicUsClaudeSonnetFiveStream extends WithAnthropicClaudeSonnetFiveConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing
  // TODO(2026-08-31): intro pricing ends; revert to standard rates
  // (standardInput 3.0, standardOutput 15.0, cacheCreated/shortCacheCreated
  // 3.75, longCacheCreated 6.0, cacheHit 0.3).
  static readonly tokenPricing = {
    cacheCreated: 2.5,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 2.5,
    longCacheCreated: 4.0,
    cacheHit: 0.2,
    standardInput: 2.0,
    standardOutput: 10.0,
  };

  static readonly region = US;

  static readonly id = this.buildId();
}

AnthropicUsClaudeSonnetFiveStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
  ClaudeSonnetFive
>;
