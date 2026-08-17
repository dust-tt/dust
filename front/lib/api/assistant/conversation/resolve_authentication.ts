import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
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
  }: {
    actionId: string;
    messageId: string;
    outcome: ResolveAuthenticationOutcome;
    kind?: ResolveAuthenticationKind;
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

  // A blocked action is only actionable while its agent message can still resume: resolving one
  // left behind by a non-resumable terminal message would relaunch an agent loop that was already
  // terminated.
  if (!(await action.canAgentMessageResume(auth))) {
    return new Err(
      new DustError(
        "action_not_blocked",
        "Action belongs to an agent message that can no longer resume"
      )
    );
  }

  const { sandboxChildActionInfo } = action.stepContext;
  const isSandboxChildAction = isSandboxChildActionInfo(sandboxChildActionInfo);

  let actionWasResolved: boolean;
  let actionIdsToClearFromRedis: string[];
  let remainingBlockedActionsForAgentMessage: AgentMCPActionResource[] | null =
    null;

  if (
    kind === "authentication" &&
    outcome === "completed" &&
    !isSandboxChildAction
  ) {
    const result =
      await action.markSameMCPServerAuthenticationActionsReady(auth);
    actionWasResolved = true;
    actionIdsToClearFromRedis = result.resolvedActions.map(
      (resolvedAction) => resolvedAction.sId
    );
    remainingBlockedActionsForAgentMessage = result.remainingBlockedActions;
  } else {
    const [updatedCount] = await action.updateStatusFromExpected(auth, {
      status: outcome === "completed" ? "ready_allowed_explicitly" : "denied",
      expectedStatus: blockedStatus,
    });
    actionWasResolved = updatedCount > 0;
    actionIdsToClearFromRedis = [action.sId];
  }

  if (!actionWasResolved) {
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

  const resolvedActionIds = new Set(actionIdsToClearFromRedis);
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isMatchingEvent(payload) &&
      resolvedActionIds.has((payload as { actionId: string }).actionId)
    );
  }, getMessageChannelId(messageId));

  if (isSandboxChildAction) {
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
        conversationId,
        conversationTitle,
        userMessageId,
        userMessageVersion,
        userMessageOrigin,
      },
    });
    return new Ok(undefined);
  }

  let blockedActions:
    | AgentMCPActionResource[]
    | AgentLoopBlockedToolExecution[];
  if (remainingBlockedActionsForAgentMessage !== null) {
    blockedActions = remainingBlockedActionsForAgentMessage;
  } else {
    const blockedActionsForConversation =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversation
      );
    blockedActions = blockedActionsForConversation.filter(
      (blockedAction) => blockedAction.messageId === messageId
    );
  }

  if (blockedActions.length > 0) {
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

  // A sub-agent's caller sits in `blocked_child_action_input_required` until we relaunch it, so
  // this must run whatever the surface the authentication was resolved from. The resolution is
  // already committed, so a failed wake-up is logged, never returned.
  await resumeAncestorConversationsHelper(auth, conversation, {
    agentMessageId,
  });

  return new Ok(undefined);
}

export const ResolveAuthenticationSchema = z.object({
  actionId: z.string(),
  outcome: z.enum(["completed", "denied"]),
});
