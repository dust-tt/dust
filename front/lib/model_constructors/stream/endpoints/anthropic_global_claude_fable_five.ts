import type {
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";
import {
  type ClaudeFableFive,
  WithAnthropicClaudeFableFiveConfig,
} from "@app/lib/model_constructors/providers/anthropic/models/claude_fable_five";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicGlobalClaudeFableFiveStream extends WithAnthropicClaudeFableFiveConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 12.5,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 12.5,
    longCacheCreated: 20.0,
    cacheHit: 1.0,
    standardInput: 10.0,
    standardOutput: 50.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeFableFiveStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  RawMessageStreamEvent,
  ClaudeFableFive
>;
