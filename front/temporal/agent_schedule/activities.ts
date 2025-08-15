import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { LightTriggerType } from "@app/types/assistant/triggers";

export async function runScheduledAgentsActivity(
  authType: AuthenticatorType,
  agentConfigurationId: string,
  trigger: LightTriggerType
) {
  if (!authType || !authType.workspaceId || !authType.userId) {
    throw new Error("Invalid authentication. Missing workspaceId or userId.");
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    authType.workspaceId,
    authType.userId
  );

  const newConversation = await createConversation(auth, {
    title: "Scheduled agent call",
    visibility: "unlisted",
  });

  const baseContext = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    username: "ScheduledAgent",
    fullName: "Scheduled Agent",
    email: auth.getNonNullableUser().email,
    profilePictureUrl: null,
    origin: null,
  };

  const messageRes = await postUserMessage(auth, {
    conversation: newConversation,
    content: "",
    mentions: [{ configurationId: agentConfigurationId }],
    context: baseContext,
    skipToolsValidation: true,
  });

  if (messageRes.isErr()) {
    console.error(
      {
        agentConfigurationId,
        conversationSid: newConversation.sId,
        error: messageRes.error,
      },
      "scheduledAgentCallActivity: Error sending message."
    );
    return;
  }

  console.log("scheduledAgentCallActivity: Message sent.");
}
