import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { MistralEuropeMistralMedium35Batch } from "@app/lib/model_constructors/batch/endpoints/mistral_eu_mistral_medium_3_5";

export class DustMistralEuropeMistralMedium35Batch extends MistralEuropeMistralMedium35Batch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustMistralEuropeMistralMedium35Batch);
