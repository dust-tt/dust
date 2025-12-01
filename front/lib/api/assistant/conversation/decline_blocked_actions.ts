import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// This will update the status of an authentication required action to denied.
// Since we don't launch a new agent loop after unlike action validation, we need to manually clear actionRequired status.
export async function declineAuthenticationRequiredAction(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  {
    actionId,
    messageId,
  }: {
    actionId: string;
    messageId: string;
  }
): Promise<Result<void, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  const agentStepContent = await AgentStepContentResource.fetchByModelId(
    action.stepContentId
  );

  if (!agentStepContent) {
    return new Err(
      new DustError(
        "internal_error",
        `Agent step content not found: ${action.stepContentId}`
      )
    );
  }

  if (action.status !== "blocked_authentication_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked for authentication: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus("denied");

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Action already declined"
    );

    return new Ok(undefined);
  }

  const messageResult = await fetchMessageInConversation(
    auth,
    conversation,
    messageId
  );
  if (!messageResult) {
    return new Err(
      new DustError("internal_error", `Message not found: ${messageId}`)
    );
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
    status: "failed",
    updatedAt: new Date(),
    errorCode: "mcp_server_personal_authentication_declined",
    errorMessage: "Personal authentication was declined by the user",
    ...messageResult.agentMessage.errorMetadata,
  });

  await ConversationResource.clearActionRequired(auth, conversation.sId);

  return new Ok(undefined);
}

export type DeclineBlockedActionsForConversationsResult = {
  failedActionCount: number;
};

export async function declineBlockedActionsForConversations(
  auth: Authenticator,
  conversationIds: string[]
): Promise<Result<DeclineBlockedActionsForConversationsResult, Error>> {
  let failedActionCount = 0;
  const conversationResources = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );

  for (const conversationResource of conversationResources) {
    // if it doesn't exist, we skip it
    if (!conversationResource) {
      continue;
    }

    const conversation = conversationResource.toJSON();

    const blockedActions =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversation.sId
      );

    const authRequiredActions = blockedActions.filter(
      (action) => action.status === "blocked_authentication_required"
    );

    const validationRequiredActions = blockedActions.filter(
      (action) => action.status === "blocked_validation_required"
    );

    if (authRequiredActions.length > 0) {
      for (const action of authRequiredActions) {
        const result = await declineAuthenticationRequiredAction(
          auth,
          conversation,
          {
            actionId: action.actionId,
            messageId: action.messageId,
          }
        );

        if (result.isErr()) {
          failedActionCount++;
        }
      }
    }

    if (validationRequiredActions.length > 0) {
      for (const action of validationRequiredActions) {
        const result = await validateAction(auth, conversation, {
          actionId: action.actionId,
          approvalState: "rejected",
          messageId: action.messageId,
        });

        if (result.isErr()) {
          failedActionCount++;
        }
      }
    }
  }

  logger.info(
    {
      conversationIds,
      failedActionCount,
      workspaceId: auth.getNonNullableWorkspace().sId,
      userId: auth.user()?.sId,
    },
    "Completed dismissing blocked actions"
  );

  return new Ok({ failedActionCount });
}
