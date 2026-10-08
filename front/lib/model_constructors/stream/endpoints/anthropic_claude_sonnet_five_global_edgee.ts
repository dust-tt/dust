import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeSonnetFive } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
import { WithAnthropicClaudeSonnetFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_five";
import { EdgeeAnthropicStream } from "@app/lib/model_constructors/stream/clients/edgee_anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicClaudeSonnetFiveGlobalEdgeeStream extends WithAnthropicClaudeSonnetFiveConfig(
  EdgeeAnthropicStream
) {
  // Anthropic's list prices: Edgee's own rates are not modeled.
  // https://platform.claude.com/docs/en/about-claude/pricing
  static readonly tokenPricing = {
    cacheCreated: 2.5,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 2.5,
    longCacheCreated: 4.0,
    cacheHit: 0.2,
    standardInput: 2.0,
    standardOutput: 10.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeSonnetFiveGlobalEdgeeStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  ClaudeSonnetFive
>;
