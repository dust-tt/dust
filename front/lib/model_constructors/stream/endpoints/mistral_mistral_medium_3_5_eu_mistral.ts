import { WithMistralMedium35Config } from "@app/lib/model_constructors/providers/mistral/models/mistral_medium_3_5";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralMistralMedium35EuropeMistralStream extends WithMistralMedium35Config(
  MistralStream
) {
  // 1.1x list price: https://docs.mistral.ai/inference/regional-inference (2026-09-22).
  static readonly tokenPricing = {
    standardInput: 1.65,
    standardOutput: 8.25,
    cacheHit: 0.165,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralMistralMedium35EuropeMistralStream satisfies StreamEndpointConstructor;
