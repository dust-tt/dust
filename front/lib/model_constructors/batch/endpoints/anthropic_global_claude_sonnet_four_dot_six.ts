import { AnthropicBatch } from "@app/lib/model_constructors/batch/clients/anthropic";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithAnthropicClaudeSonnetFourDotSixConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

// Batch leaf for Claude Sonnet 4.6: same cross-surface identity/capability
// config as the streaming leaf (injected by the shared model mixin), reached
// through the Anthropic Batches API. Only the inference surface
// (`AnthropicBatch`) and the surface-owned pricing differ.
export class AnthropicGlobalClaudeSonnetFourDotSixBatch extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicBatch
) {
  // Batch pricing is half the standard Anthropic rate.
  static readonly tokenPricing = {
    standardInput: 1.5,
    standardOutput: 7.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicGlobalClaudeSonnetFourDotSixBatch satisfies BatchEndpointConstructor;
