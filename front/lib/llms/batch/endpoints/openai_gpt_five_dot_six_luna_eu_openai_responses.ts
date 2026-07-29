import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { GPT_5_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export class DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch extends OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GPT_5_6_LUNA_MODEL_CONFIG;
}

defineDustBatchEndpoint(DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch);
