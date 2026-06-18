import type { SandboxChildActionInfo } from "@app/lib/actions/types";
import {
  isSandboxChildActionInfo,
  isSandboxResumeState,
} from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  ConversationWithoutContentType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";

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
  conversation: ConversationWithoutContentType
): Promise<void> {
  const info = action.stepContext.sandboxChildActionInfo;
  if (!isSandboxChildActionInfo(info)) {
    return;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const parentAction = await AgentMCPActionResource.fetchById(
    auth,
    info.parentActionId
  );
  if (!parentAction) {
    logger.warn(
      {
        actionId: action.sId,
        parentActionId: info.parentActionId,
        conversationId: conversation.sId,
        workspaceId,
      },
      "Sandbox-child blocked but parent action not found"
    );
    return;
  }

  // Flip the action status BEFORE pausing the sandbox provider. If the
  // provider pause then fails, the bash exec inside the sandbox is still
  // synchronously blocked on the dust-call awaiting the child response —
  // so when the child resolves, resolveSandboxChildBlock observes the
  // parent as blocked, relaunches in resume mode, and the running bash
  // reconnects via execId. DB-first is the self-converging shape.
  await parentAction.updateStatus("blocked_child_action_input_required");

  const pauseResult = await SandboxResource.pauseForApproval(
    auth,
    conversation
  );
  if (pauseResult.isErr()) {
    logger.error(
      {
        err: pauseResult.error,
        parentActionId: parentAction.sId,
        conversationId: conversation.sId,
        workspaceId,
      },
      "Failed to pause sandbox for blocked sandbox-child"
    );
  }
}

interface AgentLoopRelaunchArgs {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationBranchId: string | null;
  conversationId: string;
  conversationTitle: string | null;
  userMessageId: string;
  userMessageVersion: number;
  userMessageOrigin: UserMessageOrigin;
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
  const parentAction = await AgentMCPActionResource.fetchById(
    auth,
    parentActionId
  );

  if (!parentAction) {
    logger.error(
      {
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
      },
      "Sandbox-child resolved but parent action not found — cannot relaunch loop"
    );
    return;
  }

  // Parent is set to `blocked_child_action_input_required` by the bash
  // handler before pausing the sandbox, and stays there until the LAST
  // sibling resolves (see sibling check below). Anything else means
  // either a concurrent resolution already relaunched (harmless race) or
  // the bash handler crashed mid-pause. Either way, skip.
  if (parentAction.status !== "blocked_child_action_input_required") {
    logger.info(
      {
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
        parentStatus: parentAction.status,
      },
      "Sandbox parent not in blocked_child_action_input_required — skipping relaunch"
    );
    return;
  }

  // Defer the relaunch if any sibling sandbox-child of the same parent is
  // still blocked. The parent bash issued multiple in-flight tool calls
  // (e.g. `dust call A & dust call B`); each blocked one paused the
  // sandbox once, but the bash inside is still waiting on every response.
  // We only resume once they're all resolved so the bash sees all
  // approvals at once. The last resolution flips the parent and relaunches.
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
      agentMessageId: parentAction.agentMessageId,
    });
  const blockedSiblings = blockedActions.filter(
    (a) =>
      a.stepContext.sandboxChildActionInfo?.parentActionId === parentActionId
  );
  if (blockedSiblings.length > 0) {
    logger.info(
      {
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
        remainingSiblings: blockedSiblings.length,
      },
      "Sandbox parent has other blocked children — deferring relaunch"
    );
    return;
  }

  if (!isSandboxResumeState(parentAction.stepContext.resumeState)) {
    logger.error(
      {
        actionId: action.sId,
        parentActionId,
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
      },
      "Sandbox-paused child resolved but parent has no execId resumeState — skipping relaunch"
    );
    return;
  }

  // Flip the parent status BEFORE launching the workflow. If launch fails
  // we log loudly below — the inverse order would risk launching against a
  // parent still marked `blocked_child_action_input_required`, which the
  // resume path treats as "still paused" and would no-op.
  await parentAction.updateStatus("ready_allowed_explicitly");

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
