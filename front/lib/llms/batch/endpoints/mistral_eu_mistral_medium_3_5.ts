import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { MistralMistralMedium35EuropeMistralBatch } from "@app/lib/model_constructors/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";

export class DustMistralEuropeMistralMedium35Batch extends MistralMistralMedium35EuropeMistralBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustMistralEuropeMistralMedium35Batch);
