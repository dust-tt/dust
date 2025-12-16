import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function snapshotAgentMessageSkillsActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    return;
  }

  const auth = authResult.value;
  const owner = auth.getNonNullableWorkspace();

  const { agentMessageId } = agentLoopArgs;

  const messageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: owner.id,
    },
    include: [{ model: AgentMessageModel, as: "agentMessage", required: true }],
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
