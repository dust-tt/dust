import { Avatar, Card } from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import moment from "moment";
import { useRouter } from "next/router";
import { useContext, useMemo } from "react";

import { UserMessageMarkdown } from "@app/components/assistant/UserMessageMarkdown";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
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
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

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

  const conversationLabel =
    firstUserMessage.user?.fullName +
    " - " +
    (conversation.title ??
      (moment(conversation.created).isSame(moment(), "day")
        ? "New Conversation"
        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`));

  function getConversationDotStatus(
    conversation: ConversationType
  ): "blocked" | "unread" | "idle" {
    if (conversation.actionRequired) {
      return "blocked";
    }
    if (conversation.hasError) {
      return "blocked";
    }
    if (conversation.unread) {
      return "unread";
    }
    return "idle";
  }

  const status = getConversationDotStatus(conversation);

  const getStatusDotColor = () => {
    switch (status) {
      case "unread":
        return "s-bg-highlight-500 dark:s-bg-highlight-500-night";
      case "blocked":
        return "s-bg-golden-500 dark:s-bg-golden-500-night";
      default:
        return "";
    }
  };

  const shouldShowStatusDot = status !== "idle";
  const messageCount = conversation.content.filter(
    (versions) => !isContentFragmentType(versions[versions.length - 1])
  ).length;

  return (
    <>
      <Card
        variant="secondary"
        children={
          <div className="flex w-full flex-row items-center gap-2">
            <Avatar.Stack
              avatars={avatars}
              size="sm"
              orientation="vertical"
              nbVisibleItems={5}
            />
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-row items-center gap-2">
                {shouldShowStatusDot && (
                  <div
                    className={classNames(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      getStatusDotColor()
                    )}
                  />
                )}
                <div className="text-sm font-medium">{conversationLabel}</div>
                <div className="flex flex-grow" />
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {messageCount} {messageCount === 1 ? "message" : "messages"}
                </div>
              </div>

              <UserMessageMarkdown
                owner={owner}
                message={firstUserMessage}
                isLastMessage={false}
              />
            </div>
          </div>
        }
        onClick={async () => {
          if (sidebarOpen) {
            setSidebarOpen(false);
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
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
