import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";

export function getUserDisplayName(user: UserResource | undefined): string {
  return user?.fullName() || user?.username || user?.email || "Unknown user";
}

export function getAgentModelDisplayName(
  model: AgentModelConfigurationType | undefined
): string {
  if (!model) {
    return "—";
  }
  return getSupportedModelConfig(model)?.displayName ?? model.modelId;
}
