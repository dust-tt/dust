import { WithMistralCodestralConfig } from "@app/lib/model_constructors/providers/mistral/models/codestral";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralEuropeCodestralStream extends WithMistralCodestralConfig(
  MistralStream
) {
  // https://mistral.ai/pricing (verify before launch).
  static readonly tokenPricing = {
    standardInput: 0.3,
    standardOutput: 0.9,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralEuropeCodestralStream satisfies StreamEndpointConstructor;
