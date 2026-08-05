import { createCompactionMessage } from "@app/lib/api/assistant/conversation/messages";
import { getNextConversationMessageRank } from "@app/lib/api/assistant/conversation/rank";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { CompactionMessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withRetriedTransaction } from "@app/lib/utils/sql_utils";
import { launchCompactionWorkflow } from "@app/temporal/agent_loop/client";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type {
  CompactionMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Create a CompactionMessage in the conversation and launch the compaction workflow.
 *
 * The CompactionMessage is created with status "created". At most one may be running per
 * conversation, which the `compaction_messages_one_running_per_conversation` partial unique index
 * enforces. The workflow is launched fire-and-forget after the transaction commits.
 */
export async function compactConversation(
  auth: Authenticator,
  {
    conversation,
    model,
    sourceConversation,
  }: {
    conversation: ConversationWithoutContentType;
    model: SupportedModel;
    sourceConversation?: CompactionSourceConversation;
  }
): Promise<
  Result<
    { compactionMessage: CompactionMessageType },
    APIErrorWithContentfulStatusCode
  >
> {
  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    });
  }

  const { runningAgentMessage, runningCompactionMessage } =
    await conversationResource.getInFlightMessages(auth);
  const lastMessage = await conversationResource.getLatestMessageSummary(auth);

  if (runningAgentMessage) {
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message: "Answer the pending agent message first.",
      },
    });
  }

  if (runningCompactionMessage) {
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message: "A compaction is already in progress. Please wait.",
      },
    });
  }

  if (lastMessage && lastMessage.compactionStatus === "succeeded") {
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message:
          "This conversation was just compacted. Send a new message before compacting again.",
      },
    });
  }

  const { compactionMessage } = await withRetriedTransaction(async (t) => {
    // This check is not atomic with the insert below, and it does not need to be: the
    // `compaction_messages_one_running_per_conversation` partial unique index is what actually
    // enforces exclusivity. If a concurrent compaction commits between the two, the insert raises
    // a unique violation, the transaction retries, and this re-read then sees the winner and
    // returns the 409 below. No lock, so no per-conversation serialization and no lock ordering to
    // reconcile with the message paths.
    const inFlight = await conversationResource.getInFlightMessages(auth, {
      transaction: t,
    });

    if (inFlight.runningCompactionMessage || inFlight.runningAgentMessage) {
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
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message:
          "Cannot compact while another compaction or an agent message is running.",
      },
    });
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

  void launchCompactionWorkflow({
    auth,
    conversationId: conversation.sId,
    compactionMessageId: compactionMessage.sId,
    compactionMessageVersion: compactionMessage.version,
    model,
    sourceConversation,
  });

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

  await withRetriedTransaction(async (t) => {
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
