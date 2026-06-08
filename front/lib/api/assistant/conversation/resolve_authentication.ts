import {
  isToolFileAuthRequiredEvent,
  isToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { resumeAncestorConversations as resumeAncestorConversationsHelper } from "@app/lib/api/assistant/conversation/resume_ancestor_conversations";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { resolveSandboxChildBlock } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export type ResolveAuthenticationOutcome = "completed" | "denied";
export type ResolveAuthenticationKind = "authentication" | "file_authorization";

const KIND_CONFIG: Record<
  ResolveAuthenticationKind,
  {
    blockedStatus:
      | "blocked_authentication_required"
      | "blocked_file_authorization_required";
    isMatchingEvent: (event: unknown) => boolean;
    label: string;
  }
> = {
  authentication: {
    blockedStatus: "blocked_authentication_required",
    isMatchingEvent: isToolPersonalAuthRequiredEvent,
    label: "authentication",
  },
  file_authorization: {
    blockedStatus: "blocked_file_authorization_required",
    isMatchingEvent: isToolFileAuthRequiredEvent,
    label: "file authorization",
  },
};

export async function resolveAuthentication(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
    outcome,
    kind = "authentication",
    resumeAncestorConversations = false,
  }: {
    actionId: string;
    messageId: string;
    outcome: ResolveAuthenticationOutcome;
    kind?: ResolveAuthenticationKind;
    resumeAncestorConversations?: boolean;
  }
): Promise<Result<void, DustError>> {
  const { blockedStatus, isMatchingEvent, label } = KIND_CONFIG[kind];
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const { sId: conversationId, title: conversationTitle } = conversation;

  logger.info(
    {
      actionId,
      messageId,
      conversationId,
      outcome,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    `Resolve ${label} request`
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
    branchId,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: userMessageUserId,
      currentUserId: user?.id,
    })
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        `User is not authorized to resolve ${label} for this action`
      )
    );
  }

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (action.status !== blockedStatus) {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked for ${label}: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus(
    outcome === "completed" ? "ready_allowed_explicitly" : "denied"
  );

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      `${label} action already resolved`
    );

    return new Ok(undefined);
  }

  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isMatchingEvent(payload) &&
      (payload as { actionId: string }).actionId === actionId
    );
  }, getMessageChannelId(messageId));

  const { sandboxChildActionInfo } = action.stepContext;
  if (isSandboxChildActionInfo(sandboxChildActionInfo)) {
    // Sandbox-child resolution always relaunches the parent bash (the
    // frozen sandbox must be thawed regardless of auth outcome — the
    // relaunched bash sees the failure in its tool-call response).
    // See validateAction for the full rationale.
    await resolveSandboxChildBlock(auth, {
      action,
      sandboxChildActionInfo,
      agentLoopArgs: {
        agentMessageId,
        agentMessageVersion,
        conversationBranchId: branchId,
        conversationId,
        conversationTitle,
        userMessageId,
        userMessageVersion,
        userMessageOrigin,
      },
    });
    return new Ok(undefined);
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.some((a) => a.messageId === messageId)) {
    logger.info(
      { blockedActions },
      "Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok(undefined);
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    startStep: action.stepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId,
      messageId,
      actionId,
      outcome,
    },
    `${label} ${outcome}, agent loop resumed`
  );

  if (!resumeAncestorConversations) {
    return new Ok(undefined);
  }

  return resumeAncestorConversationsHelper(auth, conversation, {
    agentMessageId,
  });
}

export const ResolveAuthenticationSchema = z.object({
  actionId: z.string(),
  outcome: z.enum(["completed", "denied"]),
  resumeAncestorConversations: z.boolean().optional(),
});
