import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * The `run_agent` tool a sub-agent action runs, if the caller can read it. Sub-agent suggestions
 * store its id, like sidekick's `suggest_sub_agent`.
 */
export async function fetchRunAgentTool(
  auth: Authenticator
): Promise<MCPServerViewType | null> {
  const view = await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
    auth,
    "run_agent",
    { mode: "configuration" }
  );
  if (!view || !auth.can("read", view)) {
    return null;
  }
  return view.toJSON();
}

/**
 * @cc [owner:fabiencelier,label:security;product] suggestable-sub-agents-match-builder
 * An agent that a suggestion adds as a sub-agent MUST be one the agent builder offers the caller:
 * an active agent the caller can read, other than the agent it is added to. A global agent must
 * also be one the builder lists (`listDefaultGlobalAgentIds`): not a retired, model-only, sidekick
 * or reinforcement agent. The only exception is an agent that a creation of the same batch makes
 * active, which `applyBatchSuggestions` checks against the batch instead.
 */
export async function fetchSuggestableSubAgents(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, AgentResource>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const listedGlobalAgentIds = new Set<string>(listDefaultGlobalAgentIds());
  const agents = await AgentResource.fetchByIds(auth, agentIds);

  return new Map(
    agents
      .filter(
        (agent) =>
          agent.status === "active" &&
          auth.can("read", agent) &&
          (!isGlobalAgentId(agent.sId) || listedGlobalAgentIds.has(agent.sId))
      )
      .map((agent) => [agent.sId, agent])
  );
}

/**
 * Finds the agent to add as a sub-agent among the `suggestable` ones.
 */
export function checkSubAgentAddition(
  subAgentId: string,
  suggestable: Map<string, AgentResource>,
  { agentId }: { agentId?: string } = {}
): Result<AgentResource, string> {
  if (subAgentId === agentId) {
    return new Err("An agent cannot be its own sub-agent.");
  }
  const subAgent = suggestable.get(subAgentId);
  if (!subAgent) {
    return new Err(`Agent "${subAgentId}" is invalid or not accessible.`);
  }
  return new Ok(subAgent);
}

/**
 * A suggestion only removes a sub-agent run by a single action of the agent: several actions can
 * run the same sub-agent (configured differently), and removing it would remove them all.
 */
export function checkSubAgentRemoval(
  subAgentId: string,
  actions: { childAgentId: string | null }[]
): Result<undefined, string> {
  const actionCount = actions.filter(
    (action) => action.childAgentId === subAgentId
  ).length;
  if (actionCount === 0) {
    return new Err(`The agent does not have the sub-agent "${subAgentId}".`);
  }
  if (actionCount > 1) {
    return new Err(
      `Sub-agent "${subAgentId}" is run by several actions of the agent: ask the user to ` +
        "remove it from the agent builder."
    );
  }
  return new Ok(undefined);
}
