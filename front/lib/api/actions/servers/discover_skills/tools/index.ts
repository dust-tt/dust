import {
  ENABLE_DISCOVERED_SKILL_TOOL_NAME,
  SEARCH_SKILLS_TOOL_NAME,
} from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { DISCOVER_SKILLS_TOOLS_METADATA } from "@app/lib/api/actions/servers/discover_skills/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Err, Ok } from "@app/types";
import { removeNulls } from "@app/types/shared/utils/general";

export function createDiscoverSkillsTools(auth: Authenticator) {
  const handlers: ToolHandlers<typeof DISCOVER_SKILLS_TOOLS_METADATA> = {
    [SEARCH_SKILLS_TOOL_NAME]: async ({ query }, extra) => {
      if (!extra.agentLoopContext?.runContext) {
        return new Err(new MCPError("No conversation context available"));
      }

      const { agentConfiguration } = extra.agentLoopContext.runContext;

      const skills = await SkillResource.listByWorkspace(auth, {
        onlyCustom: true,
      });

      const agentSpaceSIds = agentConfiguration.requestedSpaceIds;

      // Filter skills to those whose requested spaces are all within the
      // agent's spaces. Empty agentSpaceSIds means the agent has access to
      // all spaces (e.g. dust-like global agents).
      const filteredSkills =
        agentSpaceSIds.length === 0
          ? skills
          : (() => {
              const agentSpaceModelIds = new Set(
                removeNulls(agentSpaceSIds.map(getResourceIdFromSId))
              );
              return skills.filter((skill) =>
                skill.requestedSpaceIds.every((id) =>
                  agentSpaceModelIds.has(id)
                )
              );
            })();

      const matchedSkills = query
        ? filteredSkills.filter((skill) => {
            const q = query.toLowerCase();
            return (
              skill.name.toLowerCase().includes(q) ||
              skill.agentFacingDescription.toLowerCase().includes(q)
            );
          })
        : filteredSkills;

      if (matchedSkills.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: query
              ? `No skills found matching "${query}".`
              : "No skills available.",
          },
        ]);
      }

      const skillList = matchedSkills
        .map(
          (skill) => `- **${skill.name}**: ${skill.agentFacingDescription}`
        )
        .join("\n");

      return new Ok([
        {
          type: "text" as const,
          text:
            `Found ${matchedSkills.length} skill(s):\n\n${skillList}\n\n` +
            "Use `enable_discovered_skill` with the skill name to enable a skill for this conversation.",
        },
      ]);
    },

    [ENABLE_DISCOVERED_SKILL_TOOL_NAME]: async ({ skillName }, extra) => {
      if (!extra.agentLoopContext?.runContext) {
        return new Err(new MCPError("No conversation context available"));
      }

      const { conversation, agentConfiguration } =
        extra.agentLoopContext.runContext;

      const skill = await SkillResource.fetchActiveByName(auth, skillName);
      if (!skill) {
        return new Err(
          new MCPError(`Skill "${skillName}" not found`, { tracked: false })
        );
      }

      const enableResult = await skill.enableForAgent(auth, {
        agentConfiguration,
        conversation,
        skipEquippedCheck: true,
      });

      if (enableResult.isErr()) {
        return new Err(
          new MCPError(enableResult.error.message, { tracked: false })
        );
      }

      const { alreadyEnabled } = enableResult.value;

      return new Ok([
        {
          type: "text" as const,
          text: alreadyEnabled
            ? `Skill "${skill.name}" was already enabled. No action taken.`
            : `Skill "${skill.name}" has been enabled.`,
        },
      ]);
    },
  };

  return buildTools(DISCOVER_SKILLS_TOOLS_METADATA, handlers);
}
