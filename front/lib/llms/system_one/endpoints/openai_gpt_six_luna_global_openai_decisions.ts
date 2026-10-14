import type { DustSystemOneEndpointConstructor } from "@app/lib/llms/system_one/dust_system_one_endpoint";
import { OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/model_constructors/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";
import { GPT_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export class DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne extends OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne {
  static readonly endpointFilter = {};
  static readonly modelConfig = GPT_6_LUNA_MODEL_CONFIG;
}

DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne satisfies DustSystemOneEndpointConstructor;
