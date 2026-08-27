import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { generateSmoothShutdownSummary } from "@app/lib/api/assistant/conversation/smooth_shutdown_summary";
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
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { finalizeGracefullyStoppedAgentLoopActivity } from "@app/temporal/agent_loop/activities/finalize";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  getFullAgentLoopDataWithAuth,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import maxBy from "lodash/maxBy";

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
        attributes: ["id", "spendCheckpointStatus"],
      },
    ],
  });

  if (!message?.parentId || !message.agentMessage) {
    return new Err(
      new DustError("agent_message_not_resumable", "Agent message not found")
    );
  }

  if (message.agentMessage.spendCheckpointStatus !== "paused") {
    return new Err(
      new DustError(
        "agent_message_not_resumable",
        "Agent message is not paused at the spend checkpoint"
      )
    );
  }

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

async function clearSpendCheckpointPause(
  auth: Authenticator,
  {
    agentMessageModelId,
    acknowledge,
  }: { agentMessageModelId: ModelId; acknowledge: boolean }
): Promise<{ applied: boolean }> {
  const [updatedCount] = await AgentMessageModel.update(
    {
      spendCheckpointStatus: acknowledge ? "acknowledged" : null,
    },
    {
      where: {
        id: agentMessageModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
        spendCheckpointStatus: "paused",
      },
    }
  );

  return { applied: updatedCount > 0 };
}

export async function continueSpendCheckpointPause(
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

  const { applied } = await clearSpendCheckpointPause(auth, {
    agentMessageModelId,
    acknowledge: true,
  });
  if (!applied) {
    logger.info(
      { agentMessageId, conversationId },
      "Spend checkpoint pause already resolved"
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

async function writeSmoothShutdownRecap(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const dataRes = await getFullAgentLoopDataWithAuth(auth, agentLoopArgs);
  if (dataRes.isErr()) {
    if (!isAgentLoopDataSoftDeleteError(dataRes.error)) {
      logger.warn(
        {
          agentMessageId: agentLoopArgs.agentMessageId,
          conversationId: agentLoopArgs.conversationId,
          error: dataRes.error,
        },
        "[SmoothShutdown] Failed to load agent loop data; stopping without a recap"
      );
    }
    return;
  }
  const { agentMessage, conversation } = dataRes.value;

  const summaryRes = await generateSmoothShutdownSummary(auth, conversation);
  if (summaryRes.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        conversationId: agentLoopArgs.conversationId,
        error: summaryRes.error,
      },
      "[SmoothShutdown] Failed to generate progress summary; stopping without one"
    );
    return;
  }

  const step = (maxBy(agentMessage.contents, "step")?.step ?? 0) + 1;
  await AgentStepContentResource.createNewVersion({
    workspaceId: auth.getNonNullableWorkspace().id,
    agentMessageId: agentMessage.agentMessageId,
    step,
    index: 0,
    type: "text_content",
    value: { type: "text_content", value: summaryRes.value },
  });
}

export async function declineSpendCheckpointPause(
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

  const { applied } = await clearSpendCheckpointPause(auth, {
    agentMessageModelId,
    acknowledge: false,
  });
  if (!applied) {
    logger.info(
      { agentMessageId, conversationId },
      "Spend checkpoint pause already resolved"
    );
    return new Ok(undefined);
  }

  const agentLoopArgs: AgentLoopArgs = {
    agentMessageId,
    agentMessageVersion,
    conversationId,
    conversationTitle,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  };

  await writeSmoothShutdownRecap(auth, agentLoopArgs);
  await finalizeGracefullyStoppedAgentLoopActivity(
    auth.toJSON(),
    agentLoopArgs
  );

  return new Ok(undefined);
}
