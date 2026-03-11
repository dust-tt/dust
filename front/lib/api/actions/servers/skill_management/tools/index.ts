import type { ReadableStream } from "node:stream/web";
import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Readable } from "stream";

const SKILLS_BASE_PATH = "/skills";

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

    // Load skill file attachments to the sandbox.
    const fileLoadResult = await loadSkillFilesToSandbox(auth, {
      skill,
      conversation,
    });

    let fileMessage: string | null = null;
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

/**
 * Load a skill's file attachments onto the conversation's sandbox.
 * Files are written under /skills/{skillName}.
 */
async function loadSkillFilesToSandbox(
  auth: Authenticator,
  {
    skill,
    conversation,
  }: {
    skill: SkillResource;
    conversation: ConversationType;
  }
): Promise<Result<{ loadedPaths: string[] }, Error>> {
  const fileAttachments = skill.getFileAttachments();
  if (fileAttachments.length === 0) {
    return new Ok({ loadedPaths: [] });
  }

  const ensureResult = await SandboxResource.ensureActive(auth, conversation);
  if (ensureResult.isErr()) {
    return ensureResult;
  }
  const { sandbox } = ensureResult.value;

  const loadedPaths: string[] = [];

  for (const file of fileAttachments) {
    const fileName = file.fileName ?? `file_${file.sId}`;
    const targetPath = `${SKILLS_BASE_PATH}/${skill.name}/${fileName}`;

    const readStream = file.getReadStream({ auth, version: "original" });
    const readable: ReadableStream = Readable.toWeb(readStream);

    const writeResult = await sandbox.writeFile(targetPath, readable);
    if (writeResult.isErr()) {
      return writeResult;
    }

    loadedPaths.push(targetPath);
  }

  return new Ok({ loadedPaths });
}

export const TOOLS = buildTools(SKILL_MANAGEMENT_TOOLS_METADATA, handlers);
