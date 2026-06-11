import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { isBlockedActionEvent } from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
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
import type { ModelId } from "@app/types/shared/model_id";

export type GetBlockedActionsResponseType = {
  blockedActions: BlockedToolExecution[];
};

/**
 * Resolves the blocked actions of an agent message that reached a terminal status (interrupted,
 * cancelled, failed, ...). The message will never resume, so tools still waiting on user input
 * (e.g. a manual approval) can never run: deny them so the conversation stops surfacing pending
 * approvals and doesn't stay flagged as requiring an action in the inbox.
 */
export async function resolveBlockedActionsForTerminatedMessage(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: Pick<AgentMessageType, "agentMessageId" | "sId">;
  }
): Promise<void> {
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
      agentMessageId: agentMessage.agentMessageId,
    });

  if (blockedActions.length > 0) {
    // All blocked statuses are denied, not only manual approvals: whatever input the tool was
    // waiting for (approval, authentication, user answer), the terminated message will never
    // consume it. The update is guarded on the action still being blocked, so a concurrent
    // approval is not clobbered.
    const deniedActionModelIds =
      await AgentMCPActionResource.denyIfStillBlocked(auth, {
        actionModelIds: blockedActions.map((a) => a.id),
      });

    emitApprovalResolvedAuditEvents(auth, {
      conversation,
      agentMessage,
      blockedActions,
      deniedActionModelIds,
    });

    logger.info(
      {
        actionIds: blockedActions.map((a) => a.sId),
        conversationId: conversation.sId,
        messageId: agentMessage.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Denied blocked actions of terminated agent message"
    );

    // Remove the pending blocked-action events (approval requests, auth requests, user
    // questions) from the message channel so live clients stop surfacing prompts for them.
    const blockedActionIds = new Set(blockedActions.map((a) => a.sId));
    await getRedisHybridManager().removeEvent((event) => {
      const payload = JSON.parse(event.message["payload"]);
      return (
        isBlockedActionEvent(payload) && blockedActionIds.has(payload.actionId)
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
    blockedActions,
    deniedActionModelIds,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: Pick<AgentMessageType, "agentMessageId" | "sId">;
    blockedActions: AgentMCPActionResource[];
    deniedActionModelIds: ModelId[];
  }
): void {
  const deniedModelIds = new Set(deniedActionModelIds);
  // Only audit manual approvals whose status actually transitioned: other blocked statuses
  // never emitted `tool.approval_requested`, and concurrently resolved actions were not denied
  // by us.
  const deniedApprovals = blockedActions.filter(
    (a) =>
      a.status === "blocked_validation_required" && deniedModelIds.has(a.id)
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
      const user = auth.user();
      for (const action of deniedApprovals) {
        void emitAuditLogEvent({
          auth,
          action: "tool.approval_resolved",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("agent", auditAgentConfig),
            buildAuditLogTarget("tool", {
              sId: action.toolConfiguration.name,
              name: action.toolConfiguration.originalName,
            }),
          ],
          context: getAuditLogContext(auth),
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
            deciding_user_id: user?.sId ?? "unknown",
            deciding_user_email: user?.email ?? "unknown",
          },
        });
      }
    } catch (err) {
      logger.error(
        {
          err,
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
