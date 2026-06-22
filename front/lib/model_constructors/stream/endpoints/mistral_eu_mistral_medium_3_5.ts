import { WithMistralMedium35Config } from "@app/lib/model_constructors/providers/mistral/models/mistral_medium_3_5";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralEuropeMistralMedium35Stream extends WithMistralMedium35Config(
  MistralStream
) {
  // https://mistral.ai/pricing (verify before launch).
  static readonly tokenPricing = {
    standardInput: 0.4,
    standardOutput: 2.0,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralEuropeMistralMedium35Stream satisfies StreamEndpointConstructor;
