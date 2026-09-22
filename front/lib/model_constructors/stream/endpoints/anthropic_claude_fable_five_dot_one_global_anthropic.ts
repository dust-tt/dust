import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeFableFiveDotOne } from "@app/lib/model_constructors/providers/anthropic/models/claude_fable_five_dot_one";
import { WithAnthropicClaudeFableFiveDotOneConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_fable_five_dot_one";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeFableFiveDotOneGlobalAnthropicStream extends WithAnthropicClaudeFableFiveDotOneConfig(
  AnthropicStream
) {
  // https://platform.claude.com/docs/en/about-claude/pricing (2026-09-22).
  static readonly tokenPricing = {
    cacheCreated: 12.5,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 12.5,
    longCacheCreated: 20.0,
    // Cache reads are 0.025x base input on Fable 5.1, not the usual 0.1x.
    cacheHit: 0.25,
    standardInput: 10.0,
    standardOutput: 50.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeFableFiveDotOneGlobalAnthropicStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeFableFiveDotOne
>;
