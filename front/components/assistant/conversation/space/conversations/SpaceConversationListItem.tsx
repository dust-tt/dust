import type { Avatar } from "@dust-tt/sparkle";
import { ConversationListItem, ReplySection } from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import moment from "moment";
import { useMemo } from "react";

import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightConversationType } from "@app/types/assistant/conversation";
import { isUserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";
import { stripMarkdown } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";

import { isHiddenMessage } from "../../types";
import { isMessageUnread } from "../../utils";

interface SpaceConversationListItemProps {
  conversation: LightConversationType;
  owner: WorkspaceType;
}

export function SpaceConversationListItem({
  conversation,
  owner,
}: SpaceConversationListItemProps) {
  const router = useAppRouter();
  const firstUserMessage = conversation.content.find(
    isUserMessageTypeWithContentFragments
  );

  // Compute the reply section avatars.
  const avatars = useMemo(() => {
    const avatars: Parameters<typeof Avatar.Stack>[0]["avatars"] = [];
    // Lookup the messages in reverse order and collect the users and agents icons
    // Slice to skip the first message as it's not a reply.
    for (const message of conversation.content.slice(1)) {
      if (isUserMessageTypeWithContentFragments(message)) {
        avatars.push({
          isRounded: true,
          name: message.user?.fullName ?? message.context?.fullName ?? "",
          visual:
            message.user?.image ?? message.context?.profilePictureUrl ?? "",
        });
      } else {
        avatars.push({
          isRounded: false,
          name: "@" + (message.configuration.name ?? ""),
          visual: message.configuration.pictureUrl ?? "",
        });
      }
    }
    return uniqBy(avatars.reverse(), "visual");
  }, [conversation.content]);

  const countUnreadMessages = useMemo(() => {
    return conversation.content.filter((message) => {
      return isMessageUnread(message, conversation.lastReadMs);
    }).length;
  }, [conversation.content, conversation.lastReadMs]);

  // TODO(conversations-groups) Are we sure we want to require a user message?
  if (!firstUserMessage) {
    return null;
  }

  const creatorName =
    firstUserMessage.user?.fullName ??
    firstUserMessage.context?.fullName ??
    "Unknown";
  const creatorVisual =
    firstUserMessage.user?.image ??
    firstUserMessage.context?.profilePictureUrl ??
    undefined;

  const conversationLabel =
    conversation.title ??
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  const time = moment(conversation.updated).fromNow();

  const replyCount = conversation.content.length - 1;

  let firstMessageForDescription: LightConversationType["content"][number] =
    firstUserMessage;
  if (isHiddenMessage(firstUserMessage)) {
    const firstNonHiddenMessage = conversation.content.find((message) => {
      if (!isUserMessageTypeWithContentFragments(message)) {
        return true;
      }
      return !isHiddenMessage(message);
    });

    if (firstNonHiddenMessage) {
      firstMessageForDescription = firstNonHiddenMessage;
    }
  }

  return (
    <>
      <ConversationListItem
        key={conversation.id}
        conversation={{
          id: conversation.sId,
          title: conversationLabel,
          description: stripMarkdown(firstMessageForDescription.content ?? ""),
          updatedAt: new Date(conversation.updated),
        }}
        creator={{
          fullName: creatorName,
          portrait: creatorVisual,
        }}
        time={time}
        replySection={
          replyCount || countUnreadMessages ? (
            <ReplySection
              replyCount={replyCount}
              unreadCount={countUnreadMessages}
              avatars={avatars}
              lastMessageBy={avatars[0]?.name ?? "Unknown"}
            />
          ) : null
        }
        onClick={async () => {
          await router.push(
            getConversationRoute(owner.sId, conversation.sId),
            undefined,
            { shallow: true }
          );
        }}
      />
    </>
  );
}
