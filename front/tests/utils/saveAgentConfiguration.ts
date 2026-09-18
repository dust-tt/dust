import type { Authenticator } from "@app/lib/auth";
import type { SaveAgentConfigurationParams } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Test/seed convenience mirroring the former `createAgentConfiguration` entry point: create a new
// agent when no `agentConfigurationId` is given, otherwise a new version on that agent. Production
// code uses `AgentResource.makeNew` / `AgentResource.updateConfiguration` directly, which return the
// saved agent as a resource; this helper converts it to a `LightAgentConfigurationType` for tests.
export async function saveAgentConfiguration(
  auth: Authenticator,
  {
    agentConfigurationId,
    ...params
  }: SaveAgentConfigurationParams & { agentConfigurationId?: string }
): Promise<Result<LightAgentConfigurationType, Error>> {
  let res: Result<AgentResource, Error>;
  if (!agentConfigurationId) {
    res = await AgentResource.makeNew(auth, params);
  } else {
    const agentResource = await AgentResource.fetchById(
      auth,
      agentConfigurationId
    );
    if (!agentResource || !auth.can("read", agentResource)) {
      return new Err(new Error("Agent configuration not found."));
    }
    res = await agentResource.updateConfiguration(auth, params);
  }

  if (res.isErr()) {
    return res;
  }

  return new Ok({
    ...res.value.toJSON(),
    tags: params.tags,
    userFavorite: false,
  });
}
