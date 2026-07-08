import { MistralBatch } from "@app/lib/model_constructors/batch/clients/mistral";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithMistralMedium35Config } from "@app/lib/model_constructors/providers/mistral/models/mistral_medium_3_5";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MistralEuropeMistralMedium35Batch extends WithMistralMedium35Config(
  MistralBatch
) {
  // Batch pricing is half the standard Mistral rate.
  static readonly tokenPricing = {
    standardInput: 0.2,
    standardOutput: 1.0,
  };

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();
}

MistralEuropeMistralMedium35Batch satisfies BatchEndpointConstructor;
