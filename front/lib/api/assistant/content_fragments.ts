import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import { Op, type Transaction } from "sequelize";

export function getRelatedContentFragments(
  conversation: ConversationType,
  message: UserMessageType
): ContentFragmentType[] {
  const potentialContentFragments = conversation.content
    // Only the latest version of each message.
    .map((versions) => versions[versions.length - 1])
    // Only the content fragments.
    .filter(isContentFragmentType)
    // That are preceding the message by rank in the conversation.
    .filter((m) => m.rank < message.rank)
    // Sort by rank descending.
    .toSorted((a, b) => b.rank - a.rank);

  return collectConsecutivePrecedingContentFragments(
    potentialContentFragments,
    message.rank
  );
}

/**
 * Fetch the contiguous content fragments that immediately precede `targetRank`
 * in the conversation view. Mirrors `getRelatedContentFragments` without loading
 * the full conversation content.
 */
export async function fetchPrecedingContentFragments(
  auth: Authenticator,
  {
    conversationResource,
    targetRank,
    branchId,
    transaction,
  }: {
    conversationResource: ConversationResource;
    targetRank: number;
    branchId?: string | null;
    transaction?: Transaction;
  }
): Promise<ContentFragmentType[]> {
  const scopeWhere = await conversationResource.getMessageScopeWhere(auth, {
    branchId,
    transaction,
  });

  const messages = await MessageModel.findAll({
    where: {
      ...scopeWhere,
      rank: { [Op.lt]: targetRank },
      visibility: { [Op.ne]: "deleted" },
    },
    include: [
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: true,
      },
    ],
    order: [
      ["rank", "DESC"],
      ["version", "DESC"],
    ],
    transaction,
  });

  const latestPerRank = new Map<number, MessageModel>();
  for (const m of messages) {
    if (!latestPerRank.has(m.rank)) {
      latestPerRank.set(m.rank, m);
    }
  }

  const fragments = await ContentFragmentResource.batchRenderFromMessages(
    auth,
    {
      conversationId: conversationResource.sId,
      messages: [...latestPerRank.values()],
    }
  );

  return collectConsecutivePrecedingContentFragments(fragments, targetRank);
}

function collectConsecutivePrecedingContentFragments(
  contentFragments: ContentFragmentType[],
  targetRank: number
): ContentFragmentType[] {
  const relatedContentFragments: ContentFragmentType[] = [];
  let lastRank = targetRank;

  for (const contentFragment of contentFragments.toSorted(
    (a, b) => b.rank - a.rank
  )) {
    if (contentFragment.rank === lastRank - 1) {
      relatedContentFragments.push(contentFragment);
      lastRank = contentFragment.rank;
    } else {
      break;
    }
  }

  return relatedContentFragments;
}
