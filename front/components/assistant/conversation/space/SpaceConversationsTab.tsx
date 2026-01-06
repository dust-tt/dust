import {
  Avatar,
  Button,
  Card,
  NavigationList,
  NavigationListLabel,
} from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import moment from "moment";
import { useRouter } from "next/router";
import React, { useContext, useMemo } from "react";

import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { UserMessageMarkdown } from "@app/components/assistant/UserMessageMarkdown";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ContentFragmentsType,
  ConversationType,
  Result,
  RichMention,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  isAgentMessageType,
  isContentFragmentType,
  isUserMessageType,
} from "@app/types";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface SpaceConversationListItemProps {
  conversation: ConversationType;
  owner: WorkspaceType;
  router: ReturnType<typeof useRouter>;
}

function SpaceConversationListItem({
  conversation,
  owner,
  router,
}: SpaceConversationListItemProps) {
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

interface SpaceConversationsTabProps {
  owner: WorkspaceType;
  user: UserType;
  conversations: ConversationType[];
  spaceInfo: {
    name: string;
  } | null;
  onSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[]
  ) => Promise<Result<undefined, any>>;
}

export function SpaceConversationsTab({
  owner,
  user,
  conversations,
  spaceInfo,
  onSubmit,
}: SpaceConversationsTabProps) {
  const router = useRouter();

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate: Record<GroupLabel, ConversationType[]> =
    useMemo(() => {
      return conversations.length
        ? (getGroupConversationsByDate({
            conversations,
            titleFilter: "",
          }) as Record<GroupLabel, ConversationType[]>)
        : ({} as Record<GroupLabel, typeof conversations>);
    }, [conversations]);

  const unreadConversations = useMemo(() => {
    return conversations.filter((c) => c.unread);
  }, [conversations]);

  return (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      <div className="flex w-full items-center justify-center overflow-auto">
        <div className="flex max-h-dvh w-full flex-col gap-8 pb-2 pt-4 sm:w-full sm:max-w-3xl sm:pb-4">
          <div className="flex w-full flex-col gap-4">
            <div className="heading-lg">New conversation</div>
            <div className="mx-1">
              <InputBar
                owner={owner}
                user={user}
                onSubmit={onSubmit}
                conversationId={null}
                disableAutoFocus={false}
              />
            </div>
          </div>
          {/* Space conversations section */}
          <div className="w-full">
            <div className="mb-4 flex items-center justify-between">
              <div className="heading-lg">
                Conversations in "{spaceInfo?.name ?? ""}"
              </div>
              <Button
                size="sm"
                variant="outline"
                label="Mark all as read"
                onClick={() => markAllAsRead(unreadConversations)}
                isLoading={isMarkingAllAsRead}
                disabled={unreadConversations.length === 0}
              />
            </div>

            {conversations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
                No conversations yet. Start a new conversation above.
              </div>
            ) : (
              <NavigationList className="dd-privacy-mask h-full w-full">
                {Object.keys(conversationsByDate).map((dateLabel) => {
                  const dateConversations =
                    conversationsByDate[dateLabel as GroupLabel];
                  if (dateConversations.length === 0) {
                    return null;
                  }

                  return (
                    <div key={dateLabel} className="flex flex-col gap-1">
                      <NavigationListLabel label={dateLabel} />
                      {dateConversations
                        .toSorted((a, b) => b.updated - a.updated)
                        .map((conversation) => (
                          <SpaceConversationListItem
                            key={conversation.sId}
                            conversation={conversation}
                            owner={owner}
                            router={router}
                          />
                        ))}
                    </div>
                  );
                })}
              </NavigationList>
            )}
          </div>
        </div>
      </div>
    </DropzoneContainer>
  );
}
