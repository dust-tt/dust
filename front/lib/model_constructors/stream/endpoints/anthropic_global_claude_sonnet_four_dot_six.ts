import { WithAnthropicClaudeSonnetFourDotSixConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class AnthropicGlobalClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicStream
) {
  static readonly tokenPricing = {
    cacheCreated: 3.75,
    cacheHit: 0.3,
    standardInput: 3.0,
    standardOutput: 15.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor;
