import type { DustSystemOneEndpointConstructor } from "@app/lib/llms/system_one/dust_system_one_endpoint";
import { DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/llms/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";
import { isEndpointAvailable } from "@app/lib/llms/system_one/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { SystemOneEndpointId } from "@app/lib/model_constructors/system_one";

export const DUST_SYSTEM_ONE_ENDPOINTS = {
  [DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne.id]:
    DustOpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne,
} as const satisfies Record<
  SystemOneEndpointId,
  DustSystemOneEndpointConstructor
>;

export function getSystemOneEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_SYSTEM_ONE_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
