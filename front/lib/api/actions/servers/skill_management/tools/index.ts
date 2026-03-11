import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import { getFeatureFlags } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
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

    const enableResult = await skill.enableForAgent(auth, {
      agentConfiguration,
      conversation,
    });

    if (enableResult.isErr()) {
      return new Err(
        new MCPError(enableResult.error.message, { tracked: false })
      );
    }

    if (enableResult.value.alreadyEnabled) {
      return new Ok([
        {
          type: "text" as const,
          text: `Skill "${skill.name}" was already enabled. No action taken.`,
        },
      ]);
    }

    // Load skill file attachments to the sandbox (behind feature flag).
    const owner = auth.getNonNullableWorkspace();
    const featureFlags = await getFeatureFlags(owner);

    if (
      !featureFlags.includes("sandbox_tools") ||
      skill.getFileAttachments().length === 0) {
    
      return new Ok([
        {
          type: "text" as const,
          text: `Skill "${skill.name}" has been enabled.`,
        },
      ]);
    }

    const ensureResult = await SandboxResource.ensureActive(auth, conversation);
    if (ensureResult.isErr()) {
      return new Err(new MCPError(ensureResult.error.message));
    }

    const { sandbox } = ensureResult.value;

    let fileMessage: string | null = null;
    const fileLoadResult = await sandbox.loadSkillFiles(auth, skill);

    // We don't say anything if there are no files to load.
    if (fileLoadResult.isOk() && fileLoadResult.value.loadedPaths.length > 0) {
      fileMessage =
        "Skill files successfully loaded:\n" +
        fileLoadResult.value.loadedPaths.map((p) => `  - ${p}`).join("\n");
    } else if (fileLoadResult.isErr()) {
      fileMessage = `Failed to load skill files: ${fileLoadResult.error.message}`;
    }

    return new Ok([
      {
        type: "text" as const,
        text:
          `Skill "${skill.name}" has been enabled.` +
          (fileMessage ? `\n\n${fileMessage}` : ""),
      },
    ]);
  },
};

export const TOOLS = buildTools(SKILL_MANAGEMENT_TOOLS_METADATA, handlers);
