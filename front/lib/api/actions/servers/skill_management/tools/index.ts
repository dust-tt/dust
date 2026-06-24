import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { loadSkillFilesToConversation } from "@app/lib/api/skills/conversation_files";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";

function extractSkillIdsFromConversationMessages(
  agentLoopData: AgentLoopExecutionData
): string[] {
  const userMessageSkillIds = new Set(
    extractUniqueSkillIds(agentLoopData.userMessage.content)
  );

  for (const messageVersions of agentLoopData.conversation.content) {
    const message = messageVersions.at(-1);

    if (
      message &&
      isUserMessageType(message) &&
      message.visibility === "visible" &&
      message.rank <= agentLoopData.userMessage.rank
    ) {
      for (const skillId of extractUniqueSkillIds(message.content)) {
        userMessageSkillIds.add(skillId);
      }
    }
  }

  return [...userMessageSkillIds];
}

async function findAvailableSkillForAgentLoop({
  auth,
  agentLoopData,
  skillName,
}: {
  auth: Authenticator;
  agentLoopData: AgentLoopExecutionData;
  skillName: string;
}): Promise<SkillResource | null> {
  const { enabledSkills, equippedSkills, systemSkills } =
    await SkillResource.listForAgentLoop(auth, agentLoopData);
  const userMessageSkills = await SkillResource.fetchActiveByIdsForAgentLoop(
    auth,
    extractSkillIdsFromConversationMessages(agentLoopData),
    agentLoopData
  );
  const directlyAllowedSkills = [
    ...enabledSkills,
    ...equippedSkills,
    ...userMessageSkills,
  ];

  const directSkill = directlyAllowedSkills.find(
    (skill) => skill.name === skillName
  );
  if (directSkill) {
    return directSkill;
  }

  const parentSkillById = new Map(
    [...systemSkills, ...enabledSkills, ...equippedSkills].map((skill) => [
      skill.sId,
      skill,
    ])
  );
  const candidate = await SkillResource.fetchActiveByName(auth, skillName, {
    agentLoopData,
  });
  if (!candidate) {
    return null;
  }

  const usedBySkillsByChild = await SkillResource.batchFetchUsedBySkills(auth, [
    candidate,
  ]);

  return (usedBySkillsByChild.get(candidate.sId) ?? []).some(({ sId }) => {
    const parentSkill = parentSkillById.get(sId);

    return parentSkill
      ? extractUniqueSkillIds(parentSkill.instructions).includes(candidate.sId)
      : false;
  })
    ? candidate
    : null;
}

const handlers: ToolHandlers<typeof SKILL_MANAGEMENT_TOOLS_METADATA> = {
  [ENABLE_SKILL_TOOL_NAME]: async (
    { skillName },
    { auth, agentLoopContext }
  ) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("No conversation context available"));
    }

    const { agentConfiguration, agentMessage, conversation, userMessage } =
      agentLoopContext.runContext;

    const agentLoopData = {
      agentConfiguration,
      agentMessage,
      conversation,
      userMessage,
    };

    const skill = await findAvailableSkillForAgentLoop({
      auth,
      agentLoopData,
      skillName,
    });

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
