import type { Authenticator } from "@app/lib/auth";
import type { SaveAgentConfigurationParams } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";

// Test/seed convenience mirroring the former `createAgentConfiguration` entry point: create a new
// agent when no `agentConfigurationId` is given, otherwise a new version on that agent. Production
// code uses `AgentResource.makeNew` / `AgentResource.updateConfiguration` directly.
export async function saveAgentConfiguration(
  auth: Authenticator,
  {
    agentConfigurationId,
    ...params
  }: SaveAgentConfigurationParams & { agentConfigurationId?: string }
): Promise<Result<LightAgentConfigurationType, Error>> {
  return agentConfigurationId
    ? AgentResource.updateConfiguration(auth, agentConfigurationId, params)
    : AgentResource.makeNew(auth, params);
}
