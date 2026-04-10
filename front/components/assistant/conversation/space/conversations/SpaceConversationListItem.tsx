import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightConversationType } from "@app/types/assistant/conversation";
import {
  isCompactionMessageType,
  isLightAgentMessageType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { stripMarkdown } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import type { Avatar } from "@dust-tt/sparkle";
import { ConversationListItem, ReplySection } from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import moment from "moment";
import { useMemo } from "react";
import { isHiddenMessage } from "../../types";
import { isMessageUnread } from "../../utils";

interface SpaceConversationListItemProps {
  conversation: LightConversationType;
  owner: WorkspaceType;
}

function isVisibleMessage(
  m: LightConversationType["content"][number]
): boolean {
  return (
    m.visibility !== "deleted" &&
    !(isUserMessageTypeWithContentFragments(m) && isHiddenMessage(m)) &&
    // Compaction message will possibly be first messages of a conversation (forking) but they are
    // not "visible" per se. `firstVisibleMessage` should null until a first user message is posted.
    !isCompactionMessageType(m)
  );
}

export function SpaceConversationListItem({
  conversation,
  owner,
}: SpaceConversationListItemProps) {
  const router = useAppRouter();

  const validMessages = conversation.content.filter((message) => {
    if (isCompactionMessageType(message)) {
      return false;
    }
    return (
      (isUserMessageTypeWithContentFragments(message) &&
        message.visibility === "visible" &&
        !isHiddenMessage(message)) ||
      (!isUserMessageTypeWithContentFragments(message) &&
        message.status === "succeeded")
    );
  });

  const firstVisibleMessage = conversation.content.find(isVisibleMessage);

  // Compute the reply section avatars.
  const avatars = useMemo(() => {
    const avatars: Parameters<typeof Avatar.Stack>[0]["avatars"] = [];
    // Lookup the messages in reverse order and collect the users and agents icons
    // Slice to skip the first message as it's not a reply.
    for (const message of validMessages.slice(1)) {
      if (isUserMessageTypeWithContentFragments(message)) {
        avatars.push({
          isRounded: true,
          name: message.user?.fullName ?? message.context?.fullName ?? "",
          visual:
            message.user?.image ?? message.context?.profilePictureUrl ?? "",
        });
      } else if (isCompactionMessageType(message)) {
        // Nothing to do unless we want to show that the conversation was compacted.
      } else if (isLightAgentMessageType(message)) {
        avatars.push({
          isRounded: false,
          name: "@" + (message.configuration.name ?? ""),
          visual: message.configuration.pictureUrl ?? "",
        });
      } else {
        assertNever(message);
      }
    }
    return uniqBy(avatars.reverse(), "visual");
  }, [validMessages]);

  const countUnreadMessages = useMemo(() => {
    return validMessages.filter((message) => {
      return isMessageUnread(message, conversation.lastReadMs);
    }).length;
  }, [validMessages, conversation.lastReadMs]);

  if (!firstVisibleMessage || isCompactionMessageType(firstVisibleMessage)) {
    return null;
  }

  const conversationLabel =
    conversation.title ??
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  const time = moment(conversation.updated).fromNow();

  const replyCount = validMessages.length - 1;

  let creatorName = "Unknown";
  let creatorVisual: string | undefined;

  if (isUserMessageTypeWithContentFragments(firstVisibleMessage)) {
    creatorName =
      firstVisibleMessage.user?.fullName ??
      firstVisibleMessage.context?.fullName ??
      "Unknown";
    creatorVisual =
      firstVisibleMessage.user?.image ??
      firstVisibleMessage.context?.profilePictureUrl ??
      undefined;
  } else if (isLightAgentMessageType(firstVisibleMessage)) {
    creatorName = `@${firstVisibleMessage.configuration.name}`;
    creatorVisual = firstVisibleMessage.configuration.pictureUrl || undefined;
  } else {
    assertNever(firstVisibleMessage);
  }

  return (
    <>
      <ConversationListItem
        key={conversation.id}
        conversation={{
          id: conversation.sId,
          title: conversationLabel,
          description: stripMarkdown(firstVisibleMessage.content ?? ""),
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
