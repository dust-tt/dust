import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_five_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveDotFiveBatch extends OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustOpenAIResponsesGlobalGptFiveDotFiveBatch);
