import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import type {
  SandboxChildActionInfo,
  StepContext,
} from "@app/lib/actions/types";
import {
  isSandboxChildActionInfo,
  isSandboxResumeState,
} from "@app/lib/actions/types";
import { clearBlockedActionEffects } from "@app/lib/api/assistant/conversation/blocked_actions";
import { getConversationRankVersionLock } from "@app/lib/api/assistant/conversation/lock";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  ConversationWithoutContentType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";

interface AgentLoopRelaunchArgs {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationId: string;
  conversationTitle: string | null;
  userMessageId: string;
  userMessageVersion: number;
  userMessageOrigin: UserMessageOrigin;
}

/**
 * Called when a sandbox-child action enters a blocked state. Flips the
 * parent bash action's status to `blocked_child_action_input_required`
 * and pauses the sandbox via `betaPause`. The bash tool handler observes
 * the pause via its post-exec parent status refetch — no monitor/polling
 * on the bash side.
 *
 * No-ops when the action is not a sandbox-child.
 */
export async function pauseSandboxBashForBlockedChild(
  auth: Authenticator,
  action: AgentMCPActionResource,
  conversation: ConversationWithoutContentType,
  agentLoopArgs: AgentLoopRelaunchArgs
): Promise<boolean> {
  const info = action.stepContext.sandboxChildActionInfo;
  if (!isSandboxChildActionInfo(info)) {
    return true;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const reservation = await withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    if (!(await action.canAgentMessageResume(auth, transaction))) {
      await action.updateStatusFromExpected(auth, {
        status: "denied",
        expectedStatus: action.status,
        transaction,
      });
      return { accepted: false, parentStatus: null, shouldPause: false };
    }

    const parentAction = await AgentMCPActionResource.fetchById(
      auth,
      info.parentActionId,
      transaction
    );
    if (!parentAction) {
      return { accepted: false, parentStatus: null, shouldPause: false };
    }

    if (parentAction.status === "blocked_child_action_input_required") {
      return {
        accepted: true,
        parentStatus: parentAction.status,
        shouldPause: false,
      };
    }

    if (parentAction.status !== "running") {
      await action.updateStatusFromExpected(auth, {
        status: "denied",
        expectedStatus: action.status,
        transaction,
      });
      return {
        accepted: false,
        parentStatus: parentAction.status,
        shouldPause: false,
      };
    }

    const [updatedCount] = await parentAction.updateStatusFromExpected(auth, {
      status: "blocked_child_action_input_required",
      expectedStatus: "running",
      transaction,
    });
    return {
      accepted: updatedCount === 1,
      parentStatus: parentAction.status,
      shouldPause: updatedCount === 1,
    };
  });

  if (!reservation.accepted) {
    await action.updateStatusFromExpected(auth, {
      status: "denied",
      expectedStatus: action.status,
    });
    logger.warn(
      {
        actionId: action.sId,
        parentActionId: info.parentActionId,
        parentStatus: reservation.parentStatus,
        conversationId: conversation.sId,
        workspaceId,
      },
      "Sandbox child blocked after its parent stopped"
    );
    return false;
  }

  if (reservation.shouldPause) {
    await pauseReservedSandboxBash(auth, action, conversation, agentLoopArgs);
  }

  const freshAction = await AgentMCPActionResource.fetchById(auth, action.sId);
  return (
    freshAction !== null &&
    isToolExecutionStatusBlocked(freshAction.status) &&
    (await freshAction.canAgentMessageResume(auth))
  );
}

/**
 * Pauses a sandbox whose parent was reserved before the blocked child action
 * was returned to the in-sandbox caller.
 */
export async function pauseReservedSandboxBash(
  auth: Authenticator,
  action: AgentMCPActionResource,
  conversation: ConversationWithoutContentType,
  agentLoopArgs: AgentLoopRelaunchArgs
): Promise<void> {
  const info = action.stepContext.sandboxChildActionInfo;
  if (!isSandboxChildActionInfo(info)) {
    return;
  }

  const pauseResult = await ConversationSandboxAdapter.pauseSandboxForApproval(
    auth,
    conversation,
    {
      shouldPause: () =>
        withTransaction(async (transaction) => {
          // Conversation mutations release their DB lock before lifecycle cleanup, so taking the
          // conversation lock from inside this lifecycle callback does not invert a nested lock.
          await getConversationRankVersionLock(auth, conversation, transaction);

          const freshAction = await AgentMCPActionResource.fetchById(
            auth,
            action.sId,
            transaction
          );
          const parentAction = await AgentMCPActionResource.fetchById(
            auth,
            info.parentActionId,
            transaction
          );
          if (
            !freshAction ||
            !parentAction ||
            parentAction.status !== "blocked_child_action_input_required" ||
            !(await freshAction.canAgentMessageResume(auth, transaction))
          ) {
            return false;
          }

          const execId = isSandboxResumeState(
            parentAction.stepContext.resumeState
          )
            ? parentAction.stepContext.resumeState.execId
            : info.execId;
          if (!execId) {
            return false;
          }

          await parentAction.updateStepContext(
            {
              ...parentAction.stepContext,
              resumeState: { execId },
            },
            transaction
          );
          return true;
        }),
    }
  );
  if (pauseResult.isErr()) {
    logger.error(
      {
        err: pauseResult.error,
        actionId: action.sId,
        conversationId: conversation.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Failed to pause sandbox for blocked sandbox-child"
    );
  }

  const freshAction = await AgentMCPActionResource.fetchById(auth, action.sId);
  if (freshAction && !isToolExecutionStatusBlocked(freshAction.status)) {
    await resolveSandboxChildBlock(auth, {
      action: freshAction,
      sandboxChildActionInfo: info,
      agentLoopArgs,
    });
  }
}

export async function persistActionPause(
  auth: Authenticator,
  action: AgentMCPActionResource,
  conversation: ConversationWithoutContentType,
  resumeState: StepContext["resumeState"]
): Promise<boolean> {
  return withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    const freshAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId,
      transaction
    );
    if (
      !freshAction ||
      (freshAction.status !== "running" &&
        freshAction.status !== "blocked_child_action_input_required") ||
      !(await freshAction.canAgentMessageResume(auth, transaction))
    ) {
      return false;
    }

    if (freshAction.status === "running") {
      const [updatedCount] = await freshAction.updateStatusFromExpected(auth, {
        status: "blocked_child_action_input_required",
        expectedStatus: "running",
        transaction,
      });
      if (updatedCount === 0) {
        return false;
      }
    }

    await freshAction.updateStepContext(
      {
        ...freshAction.stepContext,
        resumeState,
      },
      transaction
    );
    return true;
  });
}

/**
 * Reserves a ready sandbox child at the tool-activity boundary. Message finalization, parent
 * transitions, and child creation use the same lock, so cancellation or parent completion either
 * denies the child first or observes it as already running.
 */
export async function reserveSandboxChildRun(
  auth: Authenticator,
  action: AgentMCPActionResource,
  conversation: ConversationWithoutContentType
): Promise<AgentMCPActionResource | null> {
  const info = action.stepContext.sandboxChildActionInfo;
  if (!isSandboxChildActionInfo(info)) {
    return action;
  }

  return withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    const freshAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId,
      transaction
    );
    const parentAction = await AgentMCPActionResource.fetchById(
      auth,
      info.parentActionId,
      transaction
    );
    if (!freshAction) {
      return null;
    }

    if (
      freshAction.status !== "ready_allowed_explicitly" &&
      freshAction.status !== "ready_allowed_implicitly"
    ) {
      return null;
    }

    if (
      !parentAction ||
      (parentAction.status !== "running" &&
        parentAction.status !== "ready_allowed_explicitly" &&
        parentAction.status !== "ready_allowed_implicitly" &&
        parentAction.status !== "blocked_child_action_input_required") ||
      !(await freshAction.canAgentMessageResume(auth, transaction))
    ) {
      await freshAction.updateStatusFromExpected(auth, {
        status: "denied",
        expectedStatus: freshAction.status,
        transaction,
      });
      return null;
    }

    if (parentAction.status === "blocked_child_action_input_required") {
      return null;
    }

    if (
      parentAction.status === "ready_allowed_explicitly" ||
      parentAction.status === "ready_allowed_implicitly"
    ) {
      const [updatedParentCount] = await parentAction.updateStatusFromExpected(
        auth,
        {
          status: "running",
          expectedStatus: parentAction.status,
          transaction,
        }
      );
      if (updatedParentCount === 0) {
        return null;
      }
    }

    const [updatedCount] = await freshAction.updateStatusFromExpected(auth, {
      status: "running",
      expectedStatus: freshAction.status,
      transaction,
    });
    if (updatedCount === 0) {
      return null;
    }

    return AgentMCPActionResource.fetchById(auth, freshAction.sId, transaction);
  });
}

/**
 * Reserves a resumed sandbox parent at the tool-activity boundary. A child may have already
 * reserved the parent in the same batch, in which case the running parent is returned directly.
 */
export async function reserveSandboxParentRun(
  auth: Authenticator,
  action: AgentMCPActionResource,
  conversation: ConversationWithoutContentType
): Promise<AgentMCPActionResource | null> {
  return withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    const freshAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId,
      transaction
    );
    if (!freshAction) {
      return null;
    }
    if (freshAction.status === "running") {
      return freshAction;
    }
    if (
      freshAction.status !== "ready_allowed_explicitly" &&
      freshAction.status !== "ready_allowed_implicitly"
    ) {
      return null;
    }
    if (!(await freshAction.canAgentMessageResume(auth, transaction))) {
      await freshAction.updateStatusFromExpected(auth, {
        status: "denied",
        expectedStatus: freshAction.status,
        transaction,
      });
      return null;
    }

    const [updatedCount] = await freshAction.updateStatusFromExpected(auth, {
      status: "running",
      expectedStatus: freshAction.status,
      transaction,
    });
    if (updatedCount === 0) {
      return null;
    }

    return AgentMCPActionResource.fetchById(auth, freshAction.sId, transaction);
  });
}

/**
 * Finishes a sandbox bash under the same lock as child insertion. Any child that committed before
 * the parent finished but has not started is denied; a later child sees the final parent and is
 * rejected.
 */
export async function finishSandboxBash(
  auth: Authenticator,
  {
    action,
    conversation,
    executionDurationMs,
    messageId,
    status,
  }: {
    action: AgentMCPActionResource;
    conversation: ConversationWithoutContentType;
    executionDurationMs: number;
    messageId: string;
    status: "errored" | "succeeded";
  }
): Promise<boolean> {
  const result = await withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    const parentAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId,
      transaction
    );
    if (
      !parentAction ||
      (parentAction.status !== "running" &&
        parentAction.status !== "blocked_child_action_input_required")
    ) {
      return { completed: false, deniedChildren: [] };
    }

    const deniedChildren =
      await AgentMCPActionResource.denyPendingSandboxChildren(auth, {
        parentAction,
        transaction,
      });
    const [updatedCount] = await action.markFinalFromExpected(auth, {
      executionDurationMs,
      expectedStatus: parentAction.status,
      status,
      transaction,
    });

    return { completed: updatedCount === 1, deniedChildren };
  });

  if (result.deniedChildren.length > 0) {
    if (
      result.deniedChildren.some((child) =>
        isToolExecutionStatusBlocked(child.status)
      )
    ) {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (conversationResource) {
        const sleepResult =
          await ConversationSandboxAdapter.dangerouslySleepSandboxIfPendingApproval(
            auth,
            conversationResource
          );
        if (sleepResult.isErr()) {
          logger.error(
            {
              err: sleepResult.error,
              conversationId: conversation.sId,
              messageId,
            },
            "Failed to release sandbox after parent completion"
          );
        }
      }
    }

    await clearBlockedActionEffects(auth, {
      actionIds: result.deniedChildren.map((child) => child.sId),
      conversationId: conversation.sId,
      messageId,
    });
  }

  return result.completed;
}

/**
 * Called by every blocked-action resolution flow (approval, user-answer,
 * authentication, file-authorization) when the just-resolved action is a
 * sandbox-child. Relaunches the parent agent loop in resume mode iff the
 * parent has no other still-blocked sandbox-children — otherwise the
 * parent bash stays paused until the last sibling is resolved, so the
 * relaunched loop's getExistingActionsAndBlobs can dispatch the parent
 * (resume mode via the stored execId) and ALL approved children in one
 * shot. Mirrors the regular validate_actions sibling-deferral check.
 *
 * Callers MUST have already transitioned the child to a non-blocked state
 * and narrowed `sandboxChildActionInfo` via `isSandboxChildActionInfo`.
 */
export async function resolveSandboxChildBlock(
  auth: Authenticator,
  {
    action,
    sandboxChildActionInfo,
    agentLoopArgs,
  }: {
    action: AgentMCPActionResource;
    sandboxChildActionInfo: SandboxChildActionInfo;
    agentLoopArgs: AgentLoopRelaunchArgs;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const { parentActionId } = sandboxChildActionInfo;
  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );
  if (!conversation) {
    logger.error(
      {
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
      },
      "Sandbox-child resolved but conversation not found — cannot relaunch loop"
    );
    return;
  }

  const parentAction = await withTransaction(async (transaction) => {
    await getConversationRankVersionLock(auth, conversation, transaction);

    const parent = await AgentMCPActionResource.fetchById(
      auth,
      parentActionId,
      transaction
    );
    if (!parent || parent.status !== "blocked_child_action_input_required") {
      return null;
    }

    // Only the last blocked sibling resumes the parent. Keeping this read and the parent
    // transition under the child-creation lock prevents a new sibling from slipping in between.
    const blockedActions =
      await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
        agentMessageId: parent.agentMessageId,
        transaction,
        skipSameStepCheck: true,
      });
    const blockedSiblings = blockedActions.filter(
      (blockedAction) =>
        blockedAction.stepContext.sandboxChildActionInfo?.parentActionId ===
        parentActionId
    );
    if (
      blockedSiblings.length > 0 ||
      !isSandboxResumeState(parent.stepContext.resumeState)
    ) {
      return null;
    }

    const [updatedCount] = await parent.updateStatusFromExpected(auth, {
      status: "ready_allowed_explicitly",
      expectedStatus: "blocked_child_action_input_required",
      transaction,
    });
    return updatedCount === 1 ? parent : null;
  });

  if (!parentAction) {
    return;
  }

  const launchResult = await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs,
    startStep: parentAction.stepContent.step,
    waitForCompletion: true,
  });
  if (launchResult.isErr()) {
    logger.error(
      {
        err: launchResult.error,
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
      },
      "Failed to relaunch sandbox parent agent loop after child resolution"
    );
    return;
  }

  logger.info(
    {
      actionId: action.sId,
      parentActionId,
      conversationId: agentLoopArgs.conversationId,
      workspaceId,
    },
    "Sandbox parent bash relaunched after child action resolution"
  );
}
