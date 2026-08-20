import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { SKILL_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/skill_management/metadata";
import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { upsertSkillFilesToConversation } from "@app/lib/api/skills/conversation_files";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

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

async function mountSkillFilesToConversation(
  auth: Authenticator,
  skill: SkillResource,
  conversation: ConversationWithoutContentType
): Promise<Result<{ loadedPaths: string[] }, Error>> {
  if (!skill.hasFiles()) {
    return new Ok({ loadedPaths: [] });
  }

  return upsertSkillFilesToConversation(auth, {
    skill,
    conversation,
  });
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
  const {
    effectiveSpaceIds,
    enabledSkills,
    equippedSkills,
    favoriteSkills,
    systemSkills,
  } = await SkillResource.listForAgentLoop(auth, agentLoopData);
  const userMessageSkills = await SkillResource.fetchByIds(
    auth,
    extractSkillIdsFromConversationMessages(agentLoopData),
    { agentLoopData, effectiveSpaceIds, onlyActive: true }
  );
  const directlyAllowedSkills = [
    ...enabledSkills,
    ...equippedSkills,
    ...favoriteSkills,
    ...userMessageSkills,
  ];

  const directSkill = directlyAllowedSkills.find(
    (skill) => skill.name === skillName
  );
  if (directSkill) {
    return directSkill;
  }

  const parentSkillById = new Map(
    [
      ...systemSkills,
      ...enabledSkills,
      ...equippedSkills,
      ...favoriteSkills,
    ].map((skill) => [skill.sId, skill])
  );
  const candidate = await SkillResource.fetchByName(auth, skillName, {
    agentLoopData,
    effectiveSpaceIds,
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
  [ENABLE_SKILL_TOOL_NAME]: async ({ skillName }, { auth, runContext }) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const {
      agentConfiguration,
      modelInfo,
      agentMessage,
      conversation,
      userMessage,
    } = runContext;

    const agentLoopData = {
      agentConfiguration,
      modelInfo,
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

    // Mount the skill's files before persisting the enablement: persisting it first would let a
    // failed mount still leave the skill looking "enabled".
    const mountResult = await mountSkillFilesToConversation(
      auth,
      skill,
      conversation
    );

    if (mountResult.isErr()) {
      // Returns a failure, not a successful enablement with a warning. A retried enable_skill call
      // will attempt the mount again since it is idempotent.
      return new Err(
        new MCPError(
          `Failed to mount files for skill "${skill.name}": ${mountResult.error.message}`
        )
      );
    }

    const { wasAlreadyEnabled } = await skill.enableForAgent(auth, {
      agentConfiguration,
      conversation,
    });

    const loadedFilesList = mountResult.value.loadedPaths
      .map((p) => `  - ${p}`)
      .join("\n");

    const text = wasAlreadyEnabled
      ? mountResult.value.loadedPaths.length > 0
        ? `Skill "${skill.name}" was already enabled, but some files were missing and have ` +
          `been additionally loaded:\n\n${loadedFilesList}`
        : `Skill "${skill.name}" was already enabled.`
      : `Skill "${skill.name}" has been enabled.` +
        (mountResult.value.loadedPaths.length > 0
          ? `\n\nSkill files successfully loaded:\n${loadedFilesList}`
          : "");

    return new Ok([makeEnableSkillResultOutput({ skillId: skill.sId, text })]);
  },
};

export const TOOLS = buildTools(SKILL_MANAGEMENT_TOOLS_METADATA, handlers);
