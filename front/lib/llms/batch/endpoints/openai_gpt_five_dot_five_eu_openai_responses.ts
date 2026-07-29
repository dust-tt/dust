import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export class DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch extends OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GPT_5_5_MODEL_CONFIG;
}

defineDustBatchEndpoint(DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch);
