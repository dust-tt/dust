import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

function skillExposesAction(
  skill: SkillResource,
  action: AgentMCPActionResource
): boolean {
  const toolServerId = action.toolConfiguration.toolServerId;
  const toolName = action.toJSON().toolName;

  return skill.mcpServerConfigurations.some(({ view }) => {
    if (view.mcpServerId !== toolServerId) {
      return false;
    }

    // If the server disables the tool, the skill cannot expose it.
    return !view.getToolPermissions.some(
      (permission) => permission.toolName === toolName && !permission.enabled
    );
  });
}

export function skillIdsAttributedToAction(
  skills: SkillResource[],
  action: AgentMCPActionResource,
  enabledSkillIds: string[]
): string[] {
  // Attribute every skill that exposes the tool and any skill enabled by the action.
  // The tool keeps its full credit amount instead of splitting it across these skills.
  return [
    ...new Set([
      ...skills
        .filter((skill) => skillExposesAction(skill, action))
        .map((skill) => skill.sId),
      ...enabledSkillIds,
    ]),
  ];
}
