import { WithMistralSmallConfig } from "@app/lib/model_constructors/providers/mistral/models/mistral_small";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralEuropeMistralSmallStream extends WithMistralSmallConfig(
  MistralStream
) {
  // https://mistral.ai/pricing (verify before launch).
  static readonly tokenPricing = {
    standardInput: 0.1,
    standardOutput: 0.3,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralEuropeMistralSmallStream satisfies StreamEndpointConstructor;
