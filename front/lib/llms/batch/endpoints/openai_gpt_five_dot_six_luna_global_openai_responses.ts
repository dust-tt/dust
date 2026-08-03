import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { GPT_5_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export class DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch extends OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GPT_5_6_LUNA_MODEL_CONFIG;
}

defineDustBatchEndpoint(DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch);
