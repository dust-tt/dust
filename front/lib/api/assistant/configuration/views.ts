import type {
  FullAgentConfigurationsForViewArgs,
  LightAgentConfigurationsForViewArgs,
} from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";

export function getAgentConfigurationsForView(
  args: FullAgentConfigurationsForViewArgs
): Promise<AgentConfigurationType[]>;
export function getAgentConfigurationsForView(
  args: LightAgentConfigurationsForViewArgs
): Promise<LightAgentConfigurationType[]>;
export function getAgentConfigurationsForView(
  args: FullAgentConfigurationsForViewArgs | LightAgentConfigurationsForViewArgs
): Promise<AgentConfigurationType[] | LightAgentConfigurationType[]> {
  if (args.variant === "full") {
    return AgentResource.getAgentConfigurationsForView(args);
  }
  return AgentResource.getAgentConfigurationsForView(args);
}
