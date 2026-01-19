import type { Avatar } from "@dust-tt/sparkle";
import { ConversationListItem, ReplySection } from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import moment from "moment";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { getConversationRoute } from "@app/lib/utils/router";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type { ConversationType, WorkspaceType } from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isUserMessageType,
} from "@app/types";

interface SpaceConversationListItemProps {
  conversation: ConversationType;
  owner: WorkspaceType;
}

export function SpaceConversationListItem({
  conversation,
  owner,
}: SpaceConversationListItemProps) {
  const router = useRouter();
  const firstUserMessage = conversation.content
    .map((m) => m[m.length - 1])
    .find(isUserMessageType);

  const avatars = useMemo(() => {
    const avatars: Parameters<typeof Avatar.Stack>[0]["avatars"] = [];
    // Lookup the messages in reverse order and collect the users and agents icons
    for (const versions of conversation.content) {
      const message = versions[versions.length - 1];
      if (isUserMessageType(message)) {
        avatars.push({
          isRounded: true,
          name: message.user?.fullName ?? "",
          visual: message.user?.image ?? "",
        });
      } else if (isAgentMessageType(message)) {
        avatars.push({
          isRounded: false,
          name: "@" + (message.configuration.name ?? ""),
          visual: message.configuration.pictureUrl ?? "",
        });
      }
    }
    return uniqBy(avatars, "visual");
  }, [conversation.content]);

  // TODO(conversations-groups) Are we sure we want to require a user message?
  if (!firstUserMessage) {
    return null;
  }

  const conversationCreator = firstUserMessage.user;

  const conversationLabel =
    conversation.title ??
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  const time = formatTimestring(conversation.updated);

  const agentAndUserMessages = conversation.content.filter(
    (versions) => !isContentFragmentType(versions[versions.length - 1])
  );
  const messageCount = agentAndUserMessages.length;

  return (
    <>
      <ConversationListItem
        key={conversation.id}
        conversation={{
          id: conversation.sId,
          title: conversationLabel,
          description: "", // todo(projects) add a description on conversations
          updatedAt: new Date(conversation.updated),
        }}
        creator={
          conversationCreator
            ? {
                fullName: conversationCreator.fullName,
                portrait: conversationCreator.image ?? undefined,
              }
            : undefined
        }
        time={time}
        replySection={
          <ReplySection
            totalMessages={messageCount}
            newMessages={0} // todo(projects) count unread messages
            avatars={avatars}
            lastMessageBy={avatars[avatars.length - 1]?.name ?? "Unknown"}
          />
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
