import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { TriggerType } from "@app/types/assistant/triggers";

export async function runScheduledAgentsActivity(
  authType: AuthenticatorType,
  trigger: TriggerType
) {
  const auth = await Authenticator.fromJSON(authType);

  if (!auth.workspace() || !auth.user()) {
    throw new Error("Invalid authentication. Missing workspaceId or userId.");
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: trigger.agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration) {
    throw new Error(
      `Agent configuration with ID ${trigger.agentConfigurationId} not found in workspace ${auth.getNonNullableWorkspace().id}.`
    );
  }

  const newConversation = await createConversation(auth, {
    title: `@${agentConfiguration.name} scheduled call - ${new Date().toLocaleDateString()}`,
    visibility: "unlisted",
    triggerId: trigger.id,
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
    content:
      `:mention[${agentConfiguration.name}]{${agentConfiguration.sId}}` +
      (trigger.customPrompt ? `\n\n${trigger.customPrompt}` : ""),
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
      },
      "scheduledAgentCallActivity: Error sending message."
    );
    return;
  }
}
