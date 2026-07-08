import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIResponsesGlobalGptFiveDotFiveBatch } from "@app/lib/model_constructors/batch/endpoints/openai_responses_global_gpt_five_dot_five";

export class DustOpenAIResponsesGlobalGptFiveDotFiveBatch extends OpenAIResponsesGlobalGptFiveDotFiveBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustOpenAIResponsesGlobalGptFiveDotFiveBatch);
