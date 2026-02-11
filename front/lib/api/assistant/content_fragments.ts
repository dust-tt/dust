import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";

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

  const relatedContentFragments: ContentFragmentType[] = [];
  let lastRank = message.rank;

  // Add until we reach a gap in ranks.
  for (const contentFragment of potentialContentFragments) {
    if (contentFragment.rank === lastRank - 1) {
      relatedContentFragments.push(contentFragment);
      lastRank = contentFragment.rank;
    } else {
      break;
    }
  }

  return relatedContentFragments;
}
