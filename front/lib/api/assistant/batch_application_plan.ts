import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { SuggestionAction } from "@app/types/suggestions/agent_suggestion";
import { getAgentSuggestionAction } from "@app/types/suggestions/agent_suggestion";
import { getSkillSuggestionAction } from "@app/types/suggestions/skill_suggestion";

export type BatchApplicationStep =
  | {
      type: "skill";
      action: SuggestionAction;
      skillId: string;
      suggestions: SkillSuggestionResource[];
    }
  | {
      type: "agent";
      action: SuggestionAction;
      agentId: string;
      suggestions: AgentSuggestionResource[];
    };

/** Groups suggestions by action, then by target, in a single pass that keeps their order. */
function groupByActionAndTarget<T>(
  suggestions: T[],
  getAction: (suggestion: T) => SuggestionAction,
  getTargetId: (suggestion: T) => string
): Record<SuggestionAction, Map<string, T[]>> {
  const suggestionsByAction: Record<SuggestionAction, Map<string, T[]>> = {
    create: new Map(),
    edit: new Map(),
    delete: new Map(),
  };

  for (const suggestion of suggestions) {
    const byTarget = suggestionsByAction[getAction(suggestion)];
    const targetId = getTargetId(suggestion);
    const group = byTarget.get(targetId);
    if (group) {
      group.push(suggestion);
    } else {
      byTarget.set(targetId, [suggestion]);
    }
  }

  return suggestionsByAction;
}

/**
 * Orders the suggestions of a batch into steps, one per action and target, so that each step only
 * depends on steps applied before it. Agents reference skills, so dependencies go from agents to
 * skills:
 * - creations come first, so later steps can reference the agents and skills they create;
 * - skills are created and edited before agents, so an agent can use a skill in its final state;
 * - edits come before deletions, so an edit can detach a skill before it is deleted;
 * - agents are deleted before skills, so no remaining agent references a deleted skill.
 */
export function planBatchApplication(
  batch: BatchSuggestionResource
): BatchApplicationStep[] {
  const skillSuggestionsByAction = groupByActionAndTarget(
    batch.skillSuggestions,
    (s) => getSkillSuggestionAction(s.kind),
    (s) => s.skillConfigurationSId
  );
  const agentSuggestionsByAction = groupByActionAndTarget(
    batch.agentSuggestions,
    (s) => getAgentSuggestionAction(s.kind),
    (s) => s._agentConfigurationId
  );

  const skillSteps = (action: SuggestionAction): BatchApplicationStep[] =>
    Array.from(skillSuggestionsByAction[action], ([skillId, suggestions]) => ({
      type: "skill",
      action,
      skillId,
      suggestions,
    }));
  const agentSteps = (action: SuggestionAction): BatchApplicationStep[] =>
    Array.from(agentSuggestionsByAction[action], ([agentId, suggestions]) => ({
      type: "agent",
      action,
      agentId,
      suggestions,
    }));

  return [
    ...skillSteps("create"),
    ...agentSteps("create"),
    ...skillSteps("edit"),
    ...agentSteps("edit"),
    ...agentSteps("delete"),
    ...skillSteps("delete"),
  ];
}
