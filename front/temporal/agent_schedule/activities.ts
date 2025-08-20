import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";
import { TriggerType } from "@app/types/assistant/triggers";

export async function runScheduledAgentsActivity(
  authType: AuthenticatorType,
  trigger: TriggerType
) {
  if (!authType || !authType.workspaceId || !authType.userId) {
    throw new Error("Invalid authentication. Missing workspaceId or userId.");
  }

  const auth = await Authenticator.fromJSON(authType);

  const agentConfiguration = await AgentConfiguration.findOne({
    where: {
      id: trigger.agentConfigurationId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (!agentConfiguration) {
    throw new Error(
      `Agent configuration with ID ${trigger.agentConfigurationId} not found in workspace ${auth.getNonNullableWorkspace().id}.`
    );
  }

  const newConversation = await createConversation(auth, {
    title: "Scheduled agent call",
    visibility: "unlisted",
  });

  const baseContext = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    username: auth.getNonNullableUser().username,
    fullName: auth.getNonNullableUser().fullName(),
    email: auth.getNonNullableUser().email,
    profilePictureUrl: null,
    origin: null,
  };

  const messageRes = await postUserMessage(auth, {
    conversation: newConversation,
    content: `:mention[${agentConfiguration.name}]{${agentConfiguration.sId}}`,
    mentions: [{ configurationId: agentConfiguration.sId }],
    context: baseContext,
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    logger.error(
      {
        agentConfigurationId: trigger.agentConfigurationId,
        conversationId: newConversation.sId,
        error: messageRes.error,
        trigger,
        timestamp: new Date().toISOString(),
      },
      "scheduledAgentCallActivity: Error sending message."
    );
    return;
  }
}
