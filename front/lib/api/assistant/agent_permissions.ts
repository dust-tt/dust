import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

/**
 * @cc [owner:philipperolet,label:security] editable-agents-admin-or-write
 * Keeps only the agents the caller may edit: global agents are never editable, and a custom agent
 * requires workspace admin access or `write` on the agent. Workspace admins are allowed explicitly
 * because the admin role alone does not carry `write` on hidden agents.
 */
export function filterEditableAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): LightAgentConfigurationType[] {
  const customAgents = agents.filter((agent) => agent.scope !== "global");
  const resources = AgentResource.fromAgentConfigurations(auth, customAgents);
  const editableIds = new Set(
    resources
      .filter((resource) => auth.isAdmin() || auth.can("write", resource))
      .map((resource) => resource.sId)
  );

  return agents.filter((agent) => editableIds.has(agent.sId));
}
