import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
// TODO(2026-07-31 QOS): move these message fetches behind a resource method instead of using
// models directly in lib/api.
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { finalizeSmoothShutdownAgentLoopActivity } from "@app/temporal/agent_loop/activities/finalize";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

async function findPausedAgentMessage(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<
  Result<
    {
      agentMessageId: string;
      agentMessageVersion: number;
      agentMessageModelId: ModelId;
      pausedAtStep: number;
      userMessageId: string;
      userMessageVersion: number;
      userMessageOrigin: UserMessageOrigin;
    },
    DustError
  >
> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const message = await MessageModel.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId,
    },
    attributes: ["sId", "parentId", "version", "workspaceId"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["id", "workflowAlertThresholdStatus"],
      },
    ],
  });

  if (!message?.parentId || !message.agentMessage) {
    return new Err(
      new DustError("agent_message_not_resumable", "Agent message not found")
    );
  }

  if (message.agentMessage.workflowAlertThresholdStatus !== "paused") {
    return new Err(
      new DustError(
        "agent_message_not_resumable",
        "Agent message is not paused at the workflow alert threshold"
      )
    );
  }

  // Like every other resume path, the step to relaunch from is derived from the message's own
  // step content rather than stored on the message: the loop was fully stopped (not mid-tool), so
  // no new step content can have been written since the pause.
  const lastStepContent = await AgentStepContentModel.findOne({
    where: {
      agentMessageId: message.agentMessage.id,
      workspaceId,
    },
    attributes: ["step"],
    order: [["step", "DESC"]],
  });

  const parentMessage = await MessageModel.findOne({
    where: {
      id: message.parentId,
      conversationId: conversation.id,
      workspaceId,
    },
    attributes: ["sId", "version"],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        attributes: ["userId", "userContextOrigin"],
        required: true,
      },
    ],
  });

  if (!parentMessage?.userMessage) {
    return new Err(
      new DustError("agent_message_not_resumable", "User message not found")
    );
  }

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: parentMessage.userMessage.userId,
      currentUserId: auth.user()?.id,
    })
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to resolve this pause"
      )
    );
  }

  return new Ok({
    agentMessageId: message.sId,
    agentMessageVersion: message.version,
    agentMessageModelId: message.agentMessage.id,
    pausedAtStep: (lastStepContent?.step ?? 0) + 1,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
    userMessageOrigin: parentMessage.userMessage.userContextOrigin,
  });
}

// CAS-clear the pause flag: a double click, or a race between continuing and declining, is a
// safe no-op for whichever call loses (mirrors `AgentMCPActionResource.updateStatusFromExpected`).
// `acknowledge` permanently marks the message so the per-step gate never re-pauses it again —
// only set on the continue path, since spend only grows and would otherwise cross the same fixed
// threshold again on the very next step of the relaunched run.
async function clearWorkflowAlertThresholdPause(
  auth: Authenticator,
  {
    agentMessageModelId,
    acknowledge,
  }: { agentMessageModelId: ModelId; acknowledge: boolean }
): Promise<{ applied: boolean }> {
  const [updatedCount] = await AgentMessageModel.update(
    {
      workflowAlertThresholdStatus: acknowledge ? "acknowledged" : null,
    },
    {
      where: {
        id: agentMessageModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
        workflowAlertThresholdStatus: "paused",
      },
    }
  );

  return { applied: updatedCount > 0 };
}

/**
 * The user confirmed they want to keep going past the workflow alert threshold: relaunch the
 * agent loop from the step it paused at, exactly like `validateAction` relaunches after a tool
 * approval.
 */
export async function continueWorkflowAlertThresholdPause(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, DustError | Error>> {
  const { sId: conversationId, title: conversationTitle } = conversation;

  const foundRes = await findPausedAgentMessage(auth, conversation, {
    messageId,
  });
  if (foundRes.isErr()) {
    return foundRes;
  }

  const {
    agentMessageId,
    agentMessageVersion,
    agentMessageModelId,
    pausedAtStep,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  } = foundRes.value;

  const { applied } = await clearWorkflowAlertThresholdPause(auth, {
    agentMessageModelId,
    acknowledge: true,
  });
  if (!applied) {
    logger.info(
      { agentMessageId, conversationId },
      "Workflow alert threshold pause already resolved"
    );
    return new Ok(undefined);
  }

  return launchAgentLoopWorkflow({
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
    startStep: pausedAtStep,
    // Avoid racing with the workflow that just paused: wait for its run to be reported done
    // before starting the resumed one.
    waitForCompletion: true,
  });
}

/**
 * The user declined to continue past the workflow alert threshold. The paused workflow already
 * exited, so there is nothing left to signal — finalize directly with the same smooth-shutdown
 * logic (progress summary) the workflow itself would have run had it been signaled while still
 * active.
 */
export async function declineWorkflowAlertThresholdPause(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, DustError>> {
  const { sId: conversationId, title: conversationTitle } = conversation;

  const foundRes = await findPausedAgentMessage(auth, conversation, {
    messageId,
  });
  if (foundRes.isErr()) {
    return foundRes;
  }

  const {
    agentMessageId,
    agentMessageVersion,
    agentMessageModelId,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  } = foundRes.value;

  const { applied } = await clearWorkflowAlertThresholdPause(auth, {
    agentMessageModelId,
    acknowledge: false,
  });
  if (!applied) {
    logger.info(
      { agentMessageId, conversationId },
      "Workflow alert threshold pause already resolved"
    );
    return new Ok(undefined);
  }

  await finalizeSmoothShutdownAgentLoopActivity(auth.toJSON(), {
    agentMessageId,
    agentMessageVersion,
    conversationId,
    conversationTitle,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  });

  return new Ok(undefined);
}
