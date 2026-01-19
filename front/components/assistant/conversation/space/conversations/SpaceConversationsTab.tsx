import {
  Button,
  cn,
  ContentMessage,
  ListGroup,
  ListItemSection,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { SpaceConversationListItem } from "@app/components/assistant/conversation/space/conversations/SpaceConversationListItem";
import { SpaceConversationsActions } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsActions";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import type {
  ContentFragmentsType,
  ConversationType,
  Result,
  RichMention,
  SpaceType,
  UserType,
  WorkspaceType,
} from "@app/types";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface SpaceConversationsTabProps {
  owner: WorkspaceType;
  user: UserType;
  conversations: ConversationType[];
  isConversationsLoading: boolean;
  spaceInfo: SpaceType;
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
  isConversationsLoading,
  spaceInfo,
  onSubmit,
}: SpaceConversationsTabProps) {
  const [searchText, setSearchText] = useState("");
  const hasHistory = useMemo(() => conversations.length > 0, [conversations]);

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  // Filter conversations by search text
  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return conversations;
    }
    const searchLower = searchText.toLowerCase();
    return conversations.filter((conv) =>
      conv.title?.toLowerCase().includes(searchLower)
    );
  }, [conversations, searchText]);

  const conversationsByDate: Record<GroupLabel, ConversationType[]> =
    useMemo(() => {
      return filteredConversations.length
        ? (getGroupConversationsByDate({
            conversations: filteredConversations,
            titleFilter: "",
          }) as Record<GroupLabel, ConversationType[]>)
        : ({} as Record<GroupLabel, typeof filteredConversations>);
    }, [filteredConversations]);

  const unreadConversations = useMemo(() => {
    return filteredConversations.filter((c) => c.unread);
  }, [filteredConversations]);

  if (isConversationsLoading) {
    return (
      <div className="flex items-center justify-center">
        <Spinner size="xs" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <DropzoneContainer
        description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
        title="Attach files to the conversation"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-col gap-6 py-8",
            !hasHistory && "h-full justify-center py-8"
          )}
        >
          <div className="flex w-full flex-col gap-3">
            <div>
              <ContentMessage
                title="Experimental feature"
                variant="info"
                size="lg"
              >
                <p>
                  This feature is currently in alpha, and only available in the
                  Dust workspace ("projects" feature flag). The goal is to get
                  feedback from internal usage and quickly iterate. Share your
                  feedback in the{" "}
                  <Link
                    href="https://dust4ai.slack.com/archives/C09T7N4S6GG"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600"
                  >
                    initiative slack channel
                  </Link>
                  .
                </p>
              </ContentMessage>
            </div>
            <h2 className="heading-2xl text-foreground dark:text-foreground-night">
              {spaceInfo.name}
            </h2>
            <InputBar
              owner={owner}
              user={user}
              onSubmit={onSubmit}
              draftKey={`space-${spaceInfo.sId}-new-conversation`}
              space={spaceInfo}
              disableAutoFocus={false}
            />
          </div>

          {/* Suggestions for empty rooms */}
          {!hasHistory && <SpaceConversationsActions />}

          {/* Space conversations section */}
          <div className="w-full">
            <div className="flex flex-col gap-3">
              <SearchInput
                name="conversation-search"
                value={searchText}
                onChange={setSearchText}
                placeholder={`Search in ${spaceInfo.name}`}
                className="w-full"
              />
              <div className="flex flex-col">
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    label="Mark all as read"
                    onClick={() => markAllAsRead(unreadConversations)}
                    isLoading={isMarkingAllAsRead}
                    disabled={unreadConversations.length === 0}
                  />
                </div>
                {Object.keys(conversationsByDate).map((dateLabel) => {
                  const dateConversations =
                    conversationsByDate[dateLabel as GroupLabel];
                  if (dateConversations.length === 0) {
                    return null;
                  }

                  return (
                    <div key={dateLabel}>
                      <ListItemSection>{dateLabel}</ListItemSection>
                      <ListGroup>
                        {dateConversations
                          .toSorted((a, b) => b.updated - a.updated)
                          .map((conversation) => (
                            <SpaceConversationListItem
                              key={conversation.sId}
                              conversation={conversation}
                              owner={owner}
                            />
                          ))}
                      </ListGroup>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DropzoneContainer>
    </div>
  );
}
