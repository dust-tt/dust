import type { Authenticator } from "@app/lib/auth";
import type { AgentResource } from "@app/lib/resources/agent_resource";

/**
 * @cc [owner:philipperolet,label:security] editable-agents-admin-or-write
 * Keeps only the agents the caller may edit: global agents are never editable, and a custom agent
 * requires workspace admin access or `write` on the agent. Workspace admins are allowed explicitly
 * because the admin role alone does not carry `write` on hidden agents.
 */
export function filterEditableAgents(
  auth: Authenticator,
  agents: AgentResource[]
): AgentResource[] {
  return agents.filter(
    (agent) =>
      agent.scope !== "global" && (auth.isAdmin() || auth.can("write", agent))
  );
}
