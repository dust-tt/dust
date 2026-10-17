import type { SystemOneEndpointConstructor } from "@app/lib/model_constructors/system_one/configuration";
import { OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/model_constructors/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";

export const SYSTEM_ONE_ENDPOINTS = {
  [OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne.id]:
    OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne,
} as const satisfies Record<string, SystemOneEndpointConstructor>;

export type SystemOneEndpointId = keyof typeof SYSTEM_ONE_ENDPOINTS;
