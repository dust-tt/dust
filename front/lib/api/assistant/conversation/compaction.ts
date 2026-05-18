import {
  getConversationRankVersionLock,
  getNextConversationMessageRank,
} from "@app/lib/api/assistant/conversation/lock";
import { createCompactionMessage } from "@app/lib/api/assistant/conversation/messages";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  CompactionMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchCompactionWorkflow } from "@app/temporal/agent_loop/client";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isCompactionMessageType,
} from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class CompactionError extends Error {
  constructor(
    readonly code:
      | "running_agent"
      | "running_compaction"
      | "just_compacted"
      | "workflow_launch_failed"
  ) {
    super(code);
  }
}

/**
 * Create a CompactionMessage in the conversation and publish the compaction_message_new event.
 * Does NOT launch any workflow — the caller is responsible for starting the actual compaction.
 *
 * The CompactionMessage is created with status "created" inside the conversation advisory lock,
 * ensuring it's serialized with other conversation operations.
 */
export async function createAndPublishCompactionMessage(
  auth: Authenticator,
  {
    conversation,
    sourceConversation,
  }: {
    conversation: ConversationType;
    sourceConversation?: CompactionSourceConversation;
  }
): Promise<
  Result<{ compactionMessage: CompactionMessageType }, CompactionError>
> {
  const owner = auth.getNonNullableWorkspace();

  const runningAgentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        isAgentMessageType(m) && m.status === "created"
    );
  const runningCompaction = conversation.content
    .flat()
    .find(
      (m): m is CompactionMessageType =>
        isCompactionMessageType(m) && m.status === "created"
    );
  const lastMessage = conversation.content.at(-1)?.at(-1);

  if (runningAgentMessage) {
    return new Err(new CompactionError("running_agent"));
  }

  if (runningCompaction) {
    return new Err(new CompactionError("running_compaction"));
  }

  if (
    lastMessage &&
    isCompactionMessageType(lastMessage) &&
    lastMessage.status === "succeeded"
  ) {
    return new Err(new CompactionError("just_compacted"));
  }

  const { compactionMessage } = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    // Re-check inside the critical section of the advisory lock to avoid stacking compaction with
    // other compaction or running agent loop.
    const [runningCompactionMessage, runningAgentMessage] = await Promise.all([
      MessageModel.findOne({
        where: {
          conversationId: conversation.id,
          workspaceId: owner.id,
        },
        include: [
          {
            model: CompactionMessageModel,
            as: "compactionMessage",
            required: true,
            where: { status: "created" },
          },
        ],
        transaction: t,
      }),
      MessageModel.findOne({
        where: {
          conversationId: conversation.id,
          workspaceId: owner.id,
        },
        include: [
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: true,
            where: { status: "created" },
          },
        ],
        transaction: t,
      }),
    ]);

    if (runningCompactionMessage || runningAgentMessage) {
      return { compactionMessage: null };
    }

    const nextMessageRank = await getNextConversationMessageRank(auth, {
      conversation,
      transaction: t,
    });

    const compactionMessage = await createCompactionMessage(auth, {
      conversation,
      rank: nextMessageRank,
      sourceConversationId:
        sourceConversation?.conversationId &&
        sourceConversation.conversationId !== conversation.sId
          ? sourceConversation.conversationId
          : undefined,
      transaction: t,
    });

    return { compactionMessage };
  });

  if (!compactionMessage) {
    return new Err(new CompactionError("running_compaction"));
  }

  await publishConversationEvent(
    {
      type: "compaction_message_new",
      created: Date.now(),
      messageId: compactionMessage.sId,
      message: compactionMessage,
    },
    { conversationId: conversation.sId }
  );

  return new Ok({ compactionMessage });
}

/**
 * Conditionally fail a CompactionMessage if it is still in "created" state.
 * Returns the updated CompactionMessageType if the update happened, null if already processed.
 * This is idempotent: calling it multiple times is safe.
 */
export async function failCompactionMessageIfCreated(
  auth: Authenticator,
  { compactionMessageId }: { compactionMessageId: string }
): Promise<CompactionMessageType | null> {
  const owner = auth.getNonNullableWorkspace();

  const messageRow = await MessageModel.findOne({
    where: { sId: compactionMessageId, workspaceId: owner.id },
    include: [
      {
        model: CompactionMessageModel,
        as: "compactionMessage",
        required: true,
        where: { status: "created" },
      },
    ],
  });

  if (!messageRow?.compactionMessage) {
    return null;
  }

  const [updatedCount] = await CompactionMessageModel.update(
    { status: "failed" },
    {
      where: {
        id: messageRow.compactionMessage.id,
        status: "created",
        workspaceId: owner.id,
      },
    }
  );

  if (updatedCount === 0) {
    return null;
  }

  return {
    type: "compaction_message",
    id: messageRow.id,
    compactionMessageId: messageRow.compactionMessage.id,
    sId: messageRow.sId,
    created: messageRow.createdAt.getTime(),
    visibility: messageRow.visibility,
    version: messageRow.version,
    rank: messageRow.rank,
    branchId: messageRow.getBranchId(),
    sourceConversationId: messageRow.compactionMessage.sourceConversationId,
    status: "failed",
    content: null,
  };
}

/**
 * Create a CompactionMessage in the conversation and launch the compaction workflow.
 *
 * If the workflow fails to launch, the CompactionMessage is immediately failed so the conversation
 * is not left permanently blocked.
 */
export async function compactConversation(
  auth: Authenticator,
  {
    conversation,
    model,
    sourceConversation,
  }: {
    conversation: ConversationType;
    model: SupportedModel;
    sourceConversation?: CompactionSourceConversation;
  }
): Promise<
  Result<{ compactionMessage: CompactionMessageType }, CompactionError>
> {
  const createResult = await createAndPublishCompactionMessage(auth, {
    conversation,
    sourceConversation,
  });

  if (createResult.isErr()) {
    return createResult;
  }

  const { compactionMessage } = createResult.value;

  const launchResult = await launchCompactionWorkflow({
    auth,
    conversationId: conversation.sId,
    compactionMessageId: compactionMessage.sId,
    compactionMessageVersion: compactionMessage.version,
    model,
    sourceConversation,
  });

  if (launchResult.isErr()) {
    const failedMessage = await failCompactionMessageIfCreated(auth, {
      compactionMessageId: compactionMessage.sId,
    });

    if (failedMessage) {
      await publishConversationEvent(
        {
          type: "compaction_message_done",
          created: Date.now(),
          messageId: failedMessage.sId,
          message: failedMessage,
        },
        { conversationId: conversation.sId }
      );
    }

    return new Err(new CompactionError("workflow_launch_failed"));
  }

  return new Ok({ compactionMessage });
}

export async function updateCompactionMessageWithContentAndFinalStatus(
  auth: Authenticator,
  {
    conversation,
    compactionMessage,
    clearEnabledSkillsOnSuccess,
    status,
    content,
  }: {
    conversation: ConversationWithoutContentType;
    compactionMessage: CompactionMessageType;
    clearEnabledSkillsOnSuccess: boolean;
    status: "succeeded" | "failed";
    content: string | null;
  }
): Promise<{
  completedTs: number;
  status: "succeeded" | "failed";
}> {
  const completedAt = new Date();
  const owner = auth.getNonNullableWorkspace();

  await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    await CompactionMessageModel.update(
      { status, content },
      {
        where: {
          id: compactionMessage.compactionMessageId,
          workspaceId: owner.id,
        },
        transaction: t,
      }
    );

    if (status === "succeeded" && clearEnabledSkillsOnSuccess) {
      await SkillResource.clearAllEnabledByConversation(
        auth,
        {
          conversation,
        },
        { transaction: t }
      );
    }
  });

  return {
    completedTs: completedAt.getTime(),
    status,
  };
}
