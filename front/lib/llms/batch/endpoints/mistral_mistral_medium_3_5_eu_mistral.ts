import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { MistralMistralMedium35EuropeMistralBatch } from "@app/lib/model_constructors/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export class DustMistralMistralMedium35EuropeMistralBatch extends MistralMistralMedium35EuropeMistralBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = MISTRAL_MEDIUM_3_5_MODEL_CONFIG;
}

defineDustBatchEndpoint(DustMistralMistralMedium35EuropeMistralBatch);
