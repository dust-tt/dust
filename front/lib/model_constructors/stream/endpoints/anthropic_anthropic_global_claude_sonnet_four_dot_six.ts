import { WithAnthropicClaudeSonnetFourDotSixConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

// Streaming leaf for Claude Sonnet 4.6. All cross-surface identity/capability
// config is injected by the shared model mixin (so it stays in sync with the
// batch leaf); only the inference surface (`AnthropicStream`) and the
// surface-owned `configSchema` are pinned here.
export class AnthropicGlobalClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicStream
) {
  static readonly tokenPricing = {
    cacheCreated: 3.75,
    cacheHit: 0.3,
    standardInput: 3.0,
    standardOutput: 15.0,
  };
  static readonly region = "global";

  static readonly id = this.buildId();
  static readonly supportedReasoningEfforts =
    this.buildSupportedReasoningEfforts();
}

AnthropicGlobalClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor;
