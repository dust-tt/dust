import { WithMistralLargeConfig } from "@app/lib/model_constructors/providers/mistral/models/mistral_large";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralEuropeMistralLargeStream extends WithMistralLargeConfig(
  MistralStream
) {
  // https://mistral.ai/pricing (verify before launch).
  static readonly tokenPricing = {
    standardInput: 2.0,
    standardOutput: 6.0,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralEuropeMistralLargeStream satisfies StreamEndpointConstructor;
