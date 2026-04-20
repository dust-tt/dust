import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  CompactionMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Op } from "sequelize";

export type ReactionTargetMessageType =
  | "user"
  | "agent"
  | "content_fragment"
  | "compaction";

/**
 * Lightweight validation for a reaction target. Returns the kind of message
 * behind `messageId` in the given conversation (main branch only), or `null`
 * if the message does not exist.
 */
export async function getReactionTargetMessageType(
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: {
    conversation: ConversationResource;
    messageId: string;
  }
): Promise<ReactionTargetMessageType | null> {
  const owner = auth.getNonNullableWorkspace();

  const message = await MessageModel.findOne({
    attributes: ["id"],
    where: {
      sId: messageId,
      conversationId: conversation.id,
      workspaceId: owner.id,
      branchId: null,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
        attributes: ["id"],
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: false,
        attributes: ["id"],
      },
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
        attributes: ["id"],
      },
      {
        model: CompactionMessageModel,
        as: "compactionMessage",
        required: false,
        attributes: ["id"],
      },
    ],
  });

  if (!message) {
    return null;
  }
  if (message.compactionMessage) {
    return "compaction";
  }
  if (message.agentMessage) {
    return "agent";
  }
  if (message.userMessage) {
    return "user";
  }
  if (message.contentFragment) {
    return "content_fragment";
  }
  return null;
}

/**
 * Render `messageId` and publish a post/edit event so listeners observe the
 * updated reactions. Used after createMessageReaction / deleteMessageReaction
 * to avoid loading the full conversation just to republish a single message.
 */
export async function publishReactionUpdate(
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: {
    conversation: ConversationResource;
    messageId: string;
  }
): Promise<Result<undefined, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const messageModel = await MessageModel.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
      workspaceId: owner.id,
      branchId: null,
    },
    include: [
      { model: UserMessageModel, as: "userMessage", required: false },
      { model: AgentMessageModel, as: "agentMessage", required: false },
      { model: ContentFragmentModel, as: "contentFragment", required: false },
      {
        model: CompactionMessageModel,
        as: "compactionMessage",
        required: false,
      },
    ],
  });
  if (!messageModel) {
    return new Err(new Error("Message not found for reaction update."));
  }

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
    [messageModel],
    "full"
  );
  if (renderRes.isErr()) {
    return new Err(new Error("Failed to render message for reaction update."));
  }

  const [message] = renderRes.value;
  if (!message) {
    return new Err(new Error("Rendered message missing."));
  }

  const conversationJSON = conversation.toJSON();

  if (isUserMessageType(message)) {
    const contentFragments = await fetchPrecedingContentFragments(auth, {
      conversation,
      targetRank: message.rank,
    });
    await publishMessageEventsOnMessagePostOrEdit(
      conversationJSON,
      { ...message, contentFragments },
      []
    );
    return new Ok(undefined);
  }

  if (isAgentMessageType(message)) {
    await publishAgentMessagesEvents(conversationJSON, [message]);
    return new Ok(undefined);
  }

  return new Err(new Error("Unexpected message type for reaction update."));
}

// Fetch the contiguous content fragments that immediately precede the given
// rank in the conversation (main branch). Mirrors the behavior of
// getRelatedContentFragments but avoids loading the full conversation content.
async function fetchPrecedingContentFragments(
  auth: Authenticator,
  {
    conversation,
    targetRank,
  }: { conversation: ConversationResource; targetRank: number }
): Promise<ContentFragmentType[]> {
  const owner = auth.getNonNullableWorkspace();

  const messages = await MessageModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
      branchId: null,
      rank: { [Op.lt]: targetRank },
    },
    include: [
      { model: ContentFragmentModel, as: "contentFragment", required: true },
    ],
    order: [
      ["rank", "DESC"],
      ["version", "DESC"],
    ],
  });

  // Keep only the latest version per rank.
  const latestPerRank = new Map<number, MessageModel>();
  for (const m of messages) {
    if (!latestPerRank.has(m.rank)) {
      latestPerRank.set(m.rank, m);
    }
  }

  const fragments = await ContentFragmentResource.batchRenderFromMessages(
    auth,
    {
      conversationId: conversation.sId,
      messages: [...latestPerRank.values()],
    }
  );

  const related: ContentFragmentType[] = [];
  let lastRank = targetRank;
  for (const cf of fragments) {
    if (cf.rank === lastRank - 1) {
      related.push(cf);
      lastRank = cf.rank;
    } else {
      break;
    }
  }
  return related;
}
