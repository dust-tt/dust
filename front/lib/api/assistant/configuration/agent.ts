import { filterEditableAgents } from "@app/lib/api/assistant/agent_permissions";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function updateAgentConfigurationsScope(
  auth: Authenticator,
  agentIds: string[],
  scope: Exclude<AgentConfigurationScope, "global">
): Promise<Result<void, Error>> {
  if (agentIds.length === 0) {
    return new Ok(undefined);
  }

  // Publishing/unpublishing needs the workspace `publish` capability (checked below) plus edit
  // rights on each agent. Admins may additionally act on agents built on spaces they cannot read
  // (the manage agents page lists those behind "Show hidden agents"): `fetchByIds` returns those to
  // admins via the agent `admin` verb, and changing the scope touches nothing the spaces protect.
  const agentResources = await AgentResource.fetchByIds(auth, agentIds);

  const archivedAgentNames = agentResources
    .filter((agent) => agent.status === "archived")
    .map((agent) => agent.name);
  if (archivedAgentNames.length > 0) {
    return new Err(
      new Error(
        `Archived agents cannot be updated: ${archivedAgentNames.join(", ")}. Restore them first.`
      )
    );
  }

  const editableAgents = filterEditableAgents(auth, agentResources);
  if (editableAgents.length === 0) {
    return new Ok(undefined);
  }

  // Authorization for the scope write — the `publish` capability plus `write`/`admin` on each agent
  // — is enforced inside `AgentResource.bulkUpdate` -> `updateScopeInPlace` (see the
  // `scope-change-requires-edit-and-publish` contract), which skips any agent the caller is not
  // allowed to (un)publish.
  await AgentResource.bulkUpdate(
    auth,
    editableAgents.map((a) => a.sId),
    {
      scope,
    }
  );

  return new Ok(undefined);
}
