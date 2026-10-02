import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import {
  checkSkillAddition,
  fetchSuggestableSkills,
} from "@app/lib/api/assistant/suggestable_skills";
import {
  checkSubAgentAddition,
  fetchSuggestableSubAgents,
} from "@app/lib/api/assistant/suggestable_sub_agents";
import {
  checkToolAddition,
  checkToolRemoval,
  fetchSuggestableTools,
} from "@app/lib/api/assistant/suggestable_tools";
import type { Authenticator } from "@app/lib/auth";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Accepting a Sidekick suggestion lets the builder apply it as recorded, so a tool it adds or
 * removes, and a skill or sub-agent it adds, is checked again against live state: it may have
 * stopped qualifying (archived, restricted to skills, access lost, now used by several actions)
 * since the suggestion was recorded. A tool the agent no longer has is skipped, as there is nothing
 * left to remove.
 */
export async function checkSuggestionsApproval(
  auth: Authenticator,
  agent: AgentResource,
  suggestions: AgentSuggestionResource[]
): Promise<Result<undefined, string>> {
  const addedToolIds: string[] = [];
  const removedToolIds: string[] = [];
  const skillIds: string[] = [];
  const subAgentIds: string[] = [];
  for (const { kind, suggestion } of suggestions.map((s) => s.toJSON())) {
    switch (kind) {
      case "tools":
        if (suggestion.action === "add") {
          addedToolIds.push(suggestion.toolId);
        } else {
          removedToolIds.push(suggestion.toolId);
        }
        break;
      case "skills":
        if (suggestion.action === "add") {
          skillIds.push(suggestion.skillId);
        }
        break;
      case "sub_agent":
        if (suggestion.action === "add") {
          subAgentIds.push(suggestion.childAgentId);
        }
        break;
      case "instructions":
      case "model":
      case "knowledge":
      case "create":
      case "delete":
      case "name":
      case "description":
      case "scope":
      case "editors":
      case "tags":
      case "structured_output":
        break;
      default:
        assertNever(kind);
    }
  }

  const [actions, suggestableTools, suggestableSkills, suggestableSubAgents] =
    await Promise.all([
      removedToolIds.length > 0
        ? agent
            .listActions(auth)
            .then((a) => a.filter(isServerSideMCPServerConfiguration))
        : [],
      fetchSuggestableTools(auth, [...addedToolIds, ...removedToolIds]),
      fetchSuggestableSkills(auth, skillIds),
      fetchSuggestableSubAgents(auth, subAgentIds),
    ]);
  const checks = [
    ...addedToolIds.map((id) => checkToolAddition(id, suggestableTools)),
    ...removedToolIds
      .filter((id) => actions.some((a) => a.mcpServerViewId === id))
      .map((id) => checkToolRemoval(id, suggestableTools, actions)),
    ...skillIds.map((id) => checkSkillAddition(id, suggestableSkills)),
    ...subAgentIds.map((id) =>
      checkSubAgentAddition(id, suggestableSubAgents, { agentId: agent.sId })
    ),
  ];
  for (const check of checks) {
    if (check.isErr()) {
      return new Err(check.error);
    }
  }
  return new Ok(undefined);
}
