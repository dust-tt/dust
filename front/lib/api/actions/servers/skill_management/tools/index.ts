import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Err, Ok } from "@app/types";

const handlers: ToolHandlers<typeof SKILL_MANAGEMENT_TOOLS_METADATA> = {
  [ENABLE_SKILL_TOOL_NAME]: async ({ skillName }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    if (!extra.agentLoopContext?.runContext) {
      return new Err(new MCPError("No conversation context available"));
    }

    const { conversation, agentConfiguration } =
      extra.agentLoopContext.runContext;

    const skill = await SkillResource.fetchActiveByName(auth, skillName);
    if (!skill) {
      return new Err(
        new MCPError(`Skill "${skillName}" not found`, {
          tracked: false,
        })
      );
    }

    const enableResult = await skill.enableForAgent(auth, {
      agentConfiguration,
      conversation,
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

export const TOOLS = buildTools(SKILL_MANAGEMENT_TOOLS_METADATA, handlers);
