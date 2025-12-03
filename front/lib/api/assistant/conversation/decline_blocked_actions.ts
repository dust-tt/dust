import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { clearPersonalAuthenticationRequiredAction } from "@app/lib/api/assistant/conversation/messages";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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
  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(new Error(`Action not found: ${actionId}`));
  }

  if (action.status !== "blocked_authentication_required") {
    return new Err(
      new Error(`Action is not blocked for authentication: ${action.status}`)
    );
  }

  const [updatedCount] = await action.updateStatus("denied");

  if (updatedCount === 0) {
    return new Ok(undefined);
  }

  return clearPersonalAuthenticationRequiredAction(auth, conversation, {
    actionId,
    messageId,
  });
}

type DeclineBlockedActionsForConversationsResult = {
  failedConversationIds: string[];
};

// Assuming not that many actions will be blocked on a conversation at the same
// time.
const CLEAR_ACTION_CONCURRENCY = 4;

export async function declineBlockedActionsForConversations(
  auth: Authenticator,
  conversationIds: string[]
): Promise<Result<DeclineBlockedActionsForConversationsResult, Error>> {
  const failedConversationIds = new Set<string>();

  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );

  // TODO (2025-12-03 yuka): we end up fetching actions multiple times, we should refactor some methods
  // to avoid doing it.
  await concurrentExecutor(
    conversations,
    async (conversation) => {
      const actions =
        await AgentMCPActionResource.listBlockedActionsForConversation(
          auth,
          conversation
        );

      const blockedActions = actions
        .filter((action) => isToolExecutionStatusBlocked(action.status))
        .flat();

      const results = await concurrentExecutor(
        blockedActions,
        async (action) => {
          switch (action.status) {
            case "blocked_authentication_required":
              const declineResult = await declineAuthenticationRequiredAction(
                auth,
                conversation,
                {
                  actionId: action.actionId,
                  messageId: action.messageId,
                }
              );

              if (declineResult.isErr()) {
                failedConversationIds.add(conversation.sId);
              }

              break;
            case "blocked_child_action_input_required":
            case "blocked_validation_required":
              const validateResult = await validateAction(auth, conversation, {
                actionId: action.actionId,
                approvalState: "rejected",
                messageId: action.messageId,
                shouldRunAgentLoop: false,
              });

              if (validateResult.isErr()) {
                failedConversationIds.add(conversation.sId);
              }
          }
        },
        { concurrency: CLEAR_ACTION_CONCURRENCY }
      );

      return results;
    },
    { concurrency: CLEAR_ACTION_CONCURRENCY }
  );

  return new Ok({ failedConversationIds: Array.from(failedConversationIds) });
}
