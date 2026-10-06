import { WithMistralLarge4Config } from "@app/lib/model_constructors/providers/mistral/models/mistral_large_4";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { MISTRAL_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MistralMistralLarge4GlobalMistralStream extends WithMistralLarge4Config(
  MistralStream
) {
  // List price, no regional uplift (see `CURRENT_MODEL_PRICING`).
  static readonly tokenPricing = {
    standardInput: 0.68,
    standardOutput: 2.09,
    cacheHit: 0.07,
  };

  static readonly lab = MISTRAL_LAB;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

MistralMistralLarge4GlobalMistralStream satisfies StreamEndpointConstructor;
