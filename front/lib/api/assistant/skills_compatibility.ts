import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import type { ConversationType } from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isCompactionMessageType,
} from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";

export function getSkillNamesEnabledSinceLastCompaction(
  conversation: ConversationType,
  {
    agentConfigurationId,
  }: {
    agentConfigurationId?: string;
  } = {}
): Set<string> {
  let startIndex = 0;
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const message = conversation.content[i][conversation.content[i].length - 1];
    if (
      message &&
      isCompactionMessageType(message) &&
      message.status === "succeeded"
    ) {
      startIndex = i;
      break;
    }
  }

  const enabledSkillNames = new Set<string>();

  for (let idx = startIndex; idx < conversation.content.length; idx++) {
    const message =
      conversation.content[idx][conversation.content[idx].length - 1];
    if (
      !message ||
      !isAgentMessageType(message) ||
      message.visibility !== "visible" ||
      (agentConfigurationId &&
        message.configuration.sId !== agentConfigurationId)
    ) {
      continue;
    }

    for (const action of message.actions) {
      if (action.toolName !== ENABLE_SKILL_TOOL_NAME) {
        continue;
      }

      const skillName = action.params.skillName;
      if (!isString(skillName)) {
        continue;
      }

      const hasStructuredEnableResult = (action.output ?? []).some(
        (outputBlock) => getEnableSkillIdFromOutputBlock(outputBlock) !== null
      );
      const hasLegacyTextEnableResult = (action.output ?? [])
        .filter(isTextContent)
        .some((outputBlock) => outputBlock.text.includes("has been enabled"));

      if (hasStructuredEnableResult || hasLegacyTextEnableResult) {
        enabledSkillNames.add(skillName);
      }
    }
  }

  return enabledSkillNames;
}
