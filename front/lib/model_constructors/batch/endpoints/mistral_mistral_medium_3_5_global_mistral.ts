import { MistralBatch } from "@app/lib/model_constructors/batch/clients/mistral";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithMistralMedium35Config } from "@app/lib/model_constructors/providers/mistral/models/mistral_medium_3_5";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MistralMistralMedium35GlobalMistralBatch extends WithMistralMedium35Config(
  MistralBatch
) {
  // Half the global rate, per `BATCH_DISCOUNT_FACTOR`. No regional uplift: batch
  // runs on the global host (see `region` below).
  static readonly tokenPricing = {
    standardInput: 0.75,
    standardOutput: 3.75,
    cacheHit: 0.075,
  };

  // The Batch API is not served by the regional endpoints, so this runs on the global host
  // with no inference-location commitment — hence no 1.1x regional uplift either.
  // https://docs.mistral.ai/inference/regional-inference (verified 2026-09-22)
  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

MistralMistralMedium35GlobalMistralBatch satisfies BatchEndpointConstructor;
