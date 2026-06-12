import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { isBlockedActionEvent } from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};

/**
 * Cleans up the blocked actions of an agent message that reached a terminal status
 * (interrupted, cancelled, failed, ...). The actions were already denied in the same
 * transaction as the message's terminal status update; post-commit side effects happen here.
 */
export async function cleanupDeniedBlockedActions(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
    deniedActions,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: Pick<AgentMessageType, "agentMessageId" | "sId">;
    deniedActions: AgentMCPActionResource[];
  }
): Promise<void> {
  if (deniedActions.length > 0) {
    emitApprovalResolvedAuditEvents(auth, {
      conversation,
      agentMessage,
      deniedActions,
    });

    logger.info(
      {
        actionIds: deniedActions.map((a) => a.sId),
        conversationId: conversation.sId,
        messageId: agentMessage.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Denied blocked actions of terminated agent message"
    );

    // Remove the pending blocked-action events (approval requests, auth requests, user
    // questions) from the message channel so live clients stop surfacing prompts for them.
    const deniedActionIds = new Set(deniedActions.map((a) => a.sId));
    await getRedisHybridManager().removeEvent((event) => {
      const payload = JSON.parse(event.message["payload"]);
      return (
        isBlockedActionEvent(payload) && deniedActionIds.has(payload.actionId)
      );
    }, getMessageChannelId(agentMessage.sId));
  }

  // Always re-check the flag, even when no blocked action remains: a partial previous run may
  // have denied the actions but failed before clearing it, and a retry must converge.
  await clearActionRequiredIfNoBlockedActions(auth, {
    conversationId: conversation.sId,
  });
}

/**
 * Emits a `tool.approval_resolved` audit event for each manual approval that was auto-denied
 * when its agent message terminated, so the audit trail doesn't keep `tool.approval_requested`
 * entries without a resolution. Fire-and-forget (AUDIT1): must never block or break the
 * termination flow.
 */
function emitApprovalResolvedAuditEvents(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
    deniedActions,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: Pick<AgentMessageType, "agentMessageId" | "sId">;
    deniedActions: AgentMCPActionResource[];
  }
): void {
  // `deniedActions` are resources fetched before the transaction updates their rows, so their
  // in-memory status still identifies which blocked state they had before being denied.
  const deniedApprovals = deniedActions.filter(
    (a) => a.status === "blocked_validation_required"
  );
  if (deniedApprovals.length === 0) {
    return;
  }

  void (async () => {
    try {
      // All blocked actions belong to the same agent message, so resolve the agent
      // configuration once.
      const auditAgentConfig =
        await deniedApprovals[0].getLightAgentConfiguration(auth);
      if (!auditAgentConfig) {
        return;
      }
      const workspace = auth.getNonNullableWorkspace();
      for (const action of deniedApprovals) {
        void emitAuditLogEventDirect({
          workspace,
          action: "tool.approval_resolved",
          // Auto-denial is a mechanical termination cleanup, not a user approval decision.
          actor: {
            type: "system",
            id: "agent-message-termination",
            name: "Agent message termination",
          },
          targets: [
            buildAuditLogTarget("workspace", workspace),
            buildAuditLogTarget("agent", auditAgentConfig),
            buildAuditLogTarget("tool", {
              sId: action.toolConfiguration.name,
              name: action.toolConfiguration.originalName,
            }),
          ],
          context: { location: "internal" },
          metadata: {
            // Distinct from the user decisions ("approved", "rejected", ...): the approval was
            // resolved by the system because the message terminated, not by an explicit user
            // choice.
            decision: "auto_rejected",
            tool_name: action.toolConfiguration.originalName,
            mcp_server_name: action.toolConfiguration.mcpServerName,
            stake_level: action.toolConfiguration.permission,
            conversation_id: conversation.sId,
            agent_message_id: agentMessage.sId,
            action_id: action.sId,
            deciding_user_id: "system",
            deciding_user_email: "system",
          },
        });
      }
    } catch (err) {
      logger.error(
        {
          err: normalizeError(err),
          conversationId: conversation.sId,
          messageId: agentMessage.sId,
        },
        "Failed to emit tool.approval_resolved audit events for terminated message"
      );
    }
  })();
}

/**
 * Clears the participants' `actionRequired` flag of a conversation if no blocked action remains.
 * The flag is denormalized (set when a tool starts waiting on user input, cleared when an agent
 * loop is launched), so it can go stale when a blocked message is terminated without its blocked
 * actions being resolved.
 */
export async function clearActionRequiredIfNoBlockedActions(
  auth: Authenticator,
  { conversationId }: { conversationId: string }
): Promise<void> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return;
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.length === 0) {
    await ConversationResource.clearActionRequiredForConversation(
      auth,
      conversation
    );
  }
}
