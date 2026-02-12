import {
  Button,
  cn,
  ListGroup,
  ListItemSection,
  LoadingBlock,
  SearchInputWithPopover,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import React, { useCallback, useMemo, useState } from "react";

import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { ProjectKickoffButton } from "@app/components/assistant/conversation/space/conversations/ProjectKickoffButton";
import { SpaceConversationListItem } from "@app/components/assistant/conversation/space/conversations/SpaceConversationListItem";
import { SpaceConversationsActions } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsActions";
import { SpaceLoadingConversationListItem } from "@app/components/assistant/conversation/space/conversations/SpaceLoadingConversationListItem";
import { SpaceUserProjectDigest } from "@app/components/assistant/conversation/space/conversations/SpaceUserProjectDigest";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { ProjectJoinCTA } from "@app/components/spaces/ProjectJoinCTA";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSearchConversations } from "@app/hooks/useSearchConversations";
import { useAppRouter } from "@app/lib/platform";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type {
  ConversationWithoutContentType,
  LightConversationType,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";

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
  conversations: LightConversationType[];
  isConversationsLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  spaceInfo: GetSpaceResponseBody["space"];
  onSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[]
  ) => Promise<Result<undefined, any>>;
  onOpenMembersPanel: () => void;
}

export function SpaceConversationsTab({
  owner,
  user,
  conversations,
  isConversationsLoading,
  hasMore,
  loadMore,
  isLoadingMore,
  spaceInfo,
  onSubmit,
  onOpenMembersPanel,
}: SpaceConversationsTabProps) {
  const { isEditor: isProjectEditor } = spaceInfo;
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const router = useAppRouter();
  const hasHistory = useMemo(() => conversations.length > 0, [conversations]);

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
    spaceId: spaceInfo.sId,
  });

  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);

  const {
    conversations: searchResults,
    isSearching,
    isSearchError,
    inputValue: searchText,
    setValue: setSearchText,
  } = useSearchConversations({
    workspaceId: owner.sId,
    spaceId: spaceInfo.sId,
    limit: 10,
    initialSearchText: "",
  });

  const conversationsByDate: Record<GroupLabel, LightConversationType[]> =
    useMemo(() => {
      return conversations.length
        ? (getGroupConversationsByDate({
            conversations,
            titleFilter: "",
          }) as Record<GroupLabel, LightConversationType[]>)
        : ({} as Record<GroupLabel, typeof conversations>);
    }, [conversations]);

  const unreadConversations = useMemo(() => {
    return conversations.filter((c) => c.unread);
  }, [conversations]);

  const navigateToConversation = useCallback(
    (conversation: ConversationWithoutContentType) => {
      setSearchText("");
      void router.push(
        getConversationRoute(owner.sId, conversation.sId),
        undefined,
        { shallow: true }
      );
    },
    [owner.sId, router, setSearchText]
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <DropzoneContainer
        description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
        title="Attach files to the conversation"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-col gap-6 py-8",
            !hasHistory &&
              !isConversationsLoading &&
              "h-full justify-center py-8"
          )}
        >
          <div className="flex w-full flex-col gap-3">
            <h2 className="heading-2xl text-foreground dark:text-foreground-night">
              {spaceInfo.name}
            </h2>
            {spaceInfo.isMember ? (
              <InputBar
                owner={owner}
                user={user}
                onSubmit={onSubmit}
                draftKey={`space-${spaceInfo.sId}-new-conversation`}
                space={spaceInfo}
                disableAutoFocus={false}
              />
            ) : (
              <ProjectJoinCTA
                owner={owner}
                spaceId={spaceInfo.sId}
                spaceName={spaceInfo.name}
                isRestricted={spaceInfo.isRestricted}
                userName={user.fullName}
              />
            )}
          </div>

          {hasFeature("project_butler") && (
            <SpaceUserProjectDigest
              owner={owner}
              space={spaceInfo}
              hasConversations={hasHistory}
            />
          )}

          {/* Suggestions for empty rooms */}
          {!hasHistory && !isConversationsLoading && (
            <>
              <ProjectKickoffButton
                owner={owner}
                user={user}
                space={spaceInfo}
              />
              <SpaceConversationsActions
                isEditor={isProjectEditor}
                onOpenMembersPanel={onOpenMembersPanel}
              />
            </>
          )}

          {/* Space conversations section */}
          <div className="w-full">
            <div className="flex flex-col gap-3">
              <div className="px-3 flex flex-row gap-2">
                <SearchInputWithPopover
                  name="conversation-search"
                  value={searchText}
                  onChange={setSearchText}
                  placeholder={`Search in ${spaceInfo.name}`}
                  open={isSearchPopoverOpen && searchText.trim().length > 0}
                  onOpenChange={setIsSearchPopoverOpen}
                  items={searchResults}
                  isLoading={isSearching}
                  noResults={
                    searchText.trim().length > 0 && !isSearching
                      ? isSearchError
                        ? "Failed to search conversations. Please try again."
                        : "No conversations found."
                      : ""
                  }
                  displayItemCount={true}
                  renderItem={(conversation, selected) => {
                    const conversationLabel =
                      conversation.title ??
                      (moment(conversation.created).isSame(moment(), "day")
                        ? "New Conversation"
                        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);
                    const time = moment(conversation.updated).fromNow();

                    return (
                      <div
                        className={cn(
                          "cursor-pointer px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800",
                          selected && "bg-gray-100 dark:bg-gray-700"
                        )}
                        onClick={() => navigateToConversation(conversation)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate">
                            <div className="text-sm font-medium text-foreground dark:text-foreground-night">
                              {conversationLabel}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground dark:text-muted-foreground-night">
                            {time}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  onItemSelect={navigateToConversation}
                />
                <Button
                  size="sm"
                  variant="outline"
                  label="Mark all as read"
                  onClick={() => markAllAsRead(unreadConversations)}
                  isLoading={isMarkingAllAsRead}
                  disabled={unreadConversations.length === 0}
                />
              </div>
              <div className="flex flex-col">
                {isConversationsLoading ? (
                  <>
                    <ListItemSection>
                      <LoadingBlock className="h-[24px] w-[80px]" />
                    </ListItemSection>
                    <ListGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <SpaceLoadingConversationListItem key={index} />
                      ))}
                    </ListGroup>
                  </>
                ) : (
                  Object.keys(conversationsByDate).map((dateLabel) => {
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
                  })
                )}
                <InfiniteScroll
                  nextPage={loadMore}
                  hasMore={hasMore}
                  showLoader={isLoadingMore}
                  loader={
                    <div className="flex items-center justify-center py-4">
                      <Spinner size="xs" />
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </DropzoneContainer>
    </div>
  );
}
