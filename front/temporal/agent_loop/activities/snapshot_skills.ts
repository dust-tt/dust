import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function snapshotAgentMessageSkills(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { agentMessageId } = agentLoopArgs;

  const messageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: owner.id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id", "agentConfigurationId"],
        required: true,
      },
    ],
  });

  if (!messageRow?.agentMessage) {
    return;
  }

  await SkillResource.snapshotConversationSkillsForMessage(auth, {
    agentConfigurationId: messageRow.agentMessage.agentConfigurationId,
    agentMessageId: messageRow.agentMessage.id,
    conversationId: messageRow.conversationId,
  });
}
