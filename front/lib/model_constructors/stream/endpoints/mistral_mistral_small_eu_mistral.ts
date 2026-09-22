import { WithMistralSmallConfig } from "@app/lib/model_constructors/providers/mistral/models/mistral_small";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralMistralSmallEuropeMistralStream extends WithMistralSmallConfig(
  MistralStream
) {
  // 1.1x list price: https://docs.mistral.ai/inference/regional-inference (2026-09-22).
  static readonly tokenPricing = {
    standardInput: 0.165,
    standardOutput: 0.66,
    cacheHit: 0.0165,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralMistralSmallEuropeMistralStream satisfies StreamEndpointConstructor;
