import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { loadSkillFilesToConversation } from "@app/lib/api/skills/conversation_files";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SKILL_MANAGEMENT_TOOLS_METADATA> = {
  [ENABLE_SKILL_TOOL_NAME]: async (
    { skillName },
    { auth, agentLoopContext }
  ) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("No conversation context available"));
    }

    const { conversation, agentConfiguration } = agentLoopContext.runContext;

    const skill = await SkillResource.fetchActiveByName(auth, skillName);
    if (!skill) {
      return new Err(
        new MCPError(`Skill "${skillName}" not found`, {
          tracked: false,
        })
      );
    }

    const { wasAlreadyEnabled } = await skill.enableForAgent(auth, {
      agentConfiguration,
      conversation,
    });

    if (wasAlreadyEnabled) {
      return new Ok([
        {
          type: "text" as const,
          text: `Skill "${skill.name}" was already enabled. No action taken.`,
        },
      ]);
    }

    // Copy the skill's file attachments into the conversation file system so they are visible to
    // both the files tools and the sandbox (when one exists).
    let fileMessage: string | null = null;
    if (skill.getFileAttachments().length > 0) {
      const fileLoadResult = await loadSkillFilesToConversation(auth, {
        skill,
        conversation,
      });

      if (fileLoadResult.isOk()) {
        fileMessage =
          "Skill files successfully loaded:\n" +
          fileLoadResult.value.loadedPaths.map((p) => `  - ${p}`).join("\n");
      } else {
        fileMessage = `Failed to load skill files: ${fileLoadResult.error.message}`;
      }
    }

    const text =
      `Skill "${skill.name}" has been enabled.` +
      (fileMessage ? `\n\n${fileMessage}` : "");

    return new Ok([makeEnableSkillResultOutput({ skillId: skill.sId, text })]);
  },
};

export const TOOLS = buildTools(SKILL_MANAGEMENT_TOOLS_METADATA, handlers);
