import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { OpenAIGptSixLunaGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_six_luna_global_openai_responses";
import { GPT_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export class DustOpenAIGptSixLunaGlobalOpenAIResponsesBatch extends OpenAIGptSixLunaGlobalOpenAIResponsesBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GPT_6_LUNA_MODEL_CONFIG;
}

defineDustBatchEndpoint(DustOpenAIGptSixLunaGlobalOpenAIResponsesBatch);
