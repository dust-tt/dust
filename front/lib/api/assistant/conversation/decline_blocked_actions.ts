import { clearPersonalAuthenticationRequiredAction } from "@app/lib/api/assistant/conversation/messages";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// This will update the status of an authentication required action to denied.
// Since we don't launch a new agent loop after unlike action validation, we need to manually clear actionRequired status.
export async function declineAuthenticationRequiredAction(
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

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
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

  return clearPersonalAuthenticationRequiredAction(auth, conversation, {
    actionId,
    messageId,
  });
}

export type DeclineBlockedActionsForConversationsResult = {
  failedConversationIds: string[];
};

export async function declineBlockedActionsForConversations(
  auth: Authenticator,
  conversationIds: string[]
): Promise<Result<DeclineBlockedActionsForConversationsResult, Error>> {
  const failedConversationIds = new Set<string>();

  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );

  await concurrentExecutor(
    conversations,
    async (conversation) => {
      const blockedActions =
        await AgentMCPActionResource.listBlockedActionsForConversation(
          auth,
          conversation
        );

      const authRequiredActions = blockedActions.filter(
        (action) => action.status === "blocked_authentication_required"
      );

      const validationRequiredActions = blockedActions.filter(
        (action) => action.status === "blocked_validation_required"
      );

      if (authRequiredActions.length > 0) {
        await concurrentExecutor(
          authRequiredActions,
          async (action) => {
            const result = await declineAuthenticationRequiredAction(
              auth,
              conversation,
              {
                actionId: action.actionId,
                messageId: action.messageId,
              }
            );

            if (result.isErr()) {
              failedConversationIds.add(conversation.sId);
            }
          },
          { concurrency: 8 }
        );
      }

      if (validationRequiredActions.length > 0) {
        await concurrentExecutor(
          validationRequiredActions,
          async (action) => {
            const result = await validateAction(auth, conversation, {
              actionId: action.actionId,
              approvalState: "rejected",
              messageId: action.messageId,
              shouldRunAgentLoop: false,
            });

            if (result.isErr()) {
              failedConversationIds.add(conversation.sId);
            }
          },
          { concurrency: 8 }
        );
      }
    },
    { concurrency: 8 }
  );

  return new Ok({ failedConversationIds: Array.from(failedConversationIds) });
}
