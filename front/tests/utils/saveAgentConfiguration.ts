import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import type { SaveAgentConfigurationParams } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Test/seed convenience mirroring the former `createAgentConfiguration` entry point: create a new
// agent when no `agentConfigurationId` is given, otherwise a new version on that agent. Production
// code uses `AgentResource.makeNew` / `AgentResource.updateConfiguration` directly, which return the
// saved agent as a (read-gated) resource; this helper re-reads it as a `LightAgentConfigurationType`
// for tests.
export async function saveAgentConfiguration(
  auth: Authenticator,
  {
    agentConfigurationId,
    ...params
  }: SaveAgentConfigurationParams & { agentConfigurationId?: string }
): Promise<Result<LightAgentConfigurationType, Error>> {
  let savedResource: AgentResource;
  if (!agentConfigurationId) {
    const res = await AgentResource.makeNew(auth, params);
    if (res.isErr()) {
      return res;
    }
    savedResource = res.value;
  } else {
    const agentResource = await AgentResource.fetchById(
      auth,
      agentConfigurationId
    );
    if (!agentResource || !auth.can("read", agentResource)) {
      return new Err(new Error("Agent configuration not found."));
    }
    const res = await agentResource.updateConfiguration(auth, params);
    if (res.isErr()) {
      return res;
    }
    savedResource = res.value.resource;
  }

  // Re-read the saved agent. `makeNew` returns a resource resolved for the saver, which comes back
  // `light` when the saver cannot read it (seeds attribute agents to other authors and may build
  // them hidden or on spaces the saver is not a member of). Skip the read gate to always get the
  // full config; read as the caller when they are a workspace member, otherwise as the internal
  // admin (`getAgentConfigurations` rejects non-member auths).
  const readAuth = auth.isUser()
    ? auth
    : await Authenticator.internalAdminForWorkspace(
        auth.getNonNullableWorkspace().sId
      );
  const config = await getAgentConfiguration(readAuth, {
    agentId: savedResource.sId,
    variant: "light",
    dangerouslySkipPermissionFiltering: true,
  });
  if (!config) {
    return new Err(new Error("The saved agent must be resolvable."));
  }

  return new Ok({
    ...config,
    tags: params.tags,
    userFavorite: false,
  });
}
