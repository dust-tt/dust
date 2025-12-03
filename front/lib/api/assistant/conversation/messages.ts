import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function clearPersonalAuthenticationRequiredAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
  }: {
    actionId: string;
    messageId: string;
  }
): Promise<Result<undefined, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const messageResult = await fetchMessageInConversation(
    auth,
    conversation.toJSON(),
    messageId
  );
  if (!messageResult) {
    return new Err(new Error(`Message not found: ${messageId}`));
  }

  if (!messageResult.agentMessage) {
    logger.warn(
      {
        actionId,
        messageId,
        conversationId: conversation.sId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Failed to find agent message to update status"
    );
    return new Ok(undefined);
  }

  await messageResult.agentMessage.update({
    ...messageResult.agentMessage,
    status: "failed",
    updatedAt: new Date(),
    errorCode: "mcp_server_personal_authentication_declined",
    errorMessage: "Personal authentication was declined by the user",
  });

  await ConversationResource.clearActionRequired(auth, conversation.sId);

  return new Ok(undefined);
}
