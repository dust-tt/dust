import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { PodConversationListItem } from "@app/components/pod/conversation/PodConversationListItem";
import { PodEmptyCallout } from "@app/components/pod/conversation/PodEmptyCallout";
import { PodJoinCTA } from "@app/components/pod/conversation/PodJoinCTA";
import { PodLoadingConversationListItem } from "@app/components/pod/conversation/PodLoadingConversationListItem";
import { PodPinnedBanner } from "@app/components/pod/conversation/PodPinnedBanner";
import { usePodUnreadConversationIds } from "@app/hooks/conversations";
import type { PodConversationListFilter } from "@app/hooks/conversations/usePodConversations";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSearchPodConversations } from "@app/hooks/useSearchPodConversations";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { usePodDefaultSkills, usePodMetadata } from "@app/lib/swr/pods";
import { useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { GetSpaceResponseBody } from "@app/types/api/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { resolveDefaultAgentId } from "@app/types/user";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CheckDouble,
  Chip,
  cn,
  EmptyCTA,
  Icon,
  ListGroup,
  ListItemSection,
  LoadingBlock,
  SearchInputWithPopover,
  Spinner,
  Zap,
  ZapOff,
} from "@dust-tt/sparkle";
import moment from "moment";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useEffect, useMemo, useState } from "react";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface PodConversationsTabProps {
  owner: WorkspaceType;
  user: UserType;
  conversations: PodConversationListItemType[];
  isConversationsLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  podInfo: GetSpaceResponseBody["space"];
  isPodEmpty: boolean;
  conversationFilter: PodConversationListFilter;
  onConversationFilterChange: (filter: PodConversationListFilter) => void;
  hideTriggeredConversations: boolean;
  onHideTriggeredConversationsChange: (hide: boolean) => void;
  onSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[],
    selectedSpaceIds?: string[],
    modelSelection?: ModelSelectionType
  ) => Promise<Result<undefined, any>>;
  onNavigateToTasks: () => void;
}

export function PodConversationsTab({
  owner,
  user,
  conversations,
  isConversationsLoading,
  hasMore,
  loadMore,
  isLoadingMore,
  podInfo,
  isPodEmpty,
  conversationFilter,
  onConversationFilterChange,
  hideTriggeredConversations,
  onHideTriggeredConversationsChange,
  onSubmit,
  onNavigateToTasks,
}: PodConversationsTabProps) {
  const { isEditor } = podInfo;
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();
  const hasHistory = useMemo(() => conversations.length > 0, [conversations]);

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
    podId: podInfo.sId,
  });
  const { unreadConversationIds } = usePodUnreadConversationIds({
    workspaceId: owner.sId,
    podId: podInfo.sId,
  });
  // This pod's default agent, applied to new conversations started here. Resolved
  // downstream in `useHandleMentions`, falling back to @dust.
  const { podMetadata, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId: podInfo.sId,
  });

  // Unless a pod default is explicitly set, fall back to the workspace-wide default
  // agent. The final fallback to @dust happens in `useHandleMentions`.
  const defaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature: hasFeature("workspace_default_agent"),
  });

  const { defaultSkills, isDefaultSkillsLoading } = usePodDefaultSkills({
    owner,
    podId: podInfo.sId,
  });

  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);

  const noConversationsForFilterMessage = useMemo(() => {
    switch (conversationFilter) {
      case "all":
        return "No conversations found.";
      case "group":
        return "No group conversations yet in this Pod.";
      case "with_me":
        return "You are not a participant in any conversation yet.";
    }
  }, [conversationFilter]);

  const {
    conversations: searchResults,
    isSearching,
    isSearchError,
    inputValue: searchText,
    setValue: setSearchText,
  } = useSearchPodConversations({
    workspaceId: owner.sId,
    podId: podInfo.sId,
    limit: 10,
    initialSearchText: "",
  });
  const isWidthConstrained = useIsWidthConstrained();
  const conversationsByDate: Record<GroupLabel, PodConversationListItemType[]> =
    useMemo(() => {
      return conversations.length
        ? (getGroupConversationsByDate({
            conversations,
            titleFilter: "",
          }) as Record<GroupLabel, PodConversationListItemType[]>)
        : ({} as Record<GroupLabel, typeof conversations>);
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

  const [greeting, setGreeting] = useState<string>("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: force re-render when podInfo.name changes
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user.firstName, podInfo.name]);

  const isFilteredEmpty = !isConversationsLoading && !isPodEmpty && !hasHistory;
  const isSingleMemberPod = podInfo.members.length === 1;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <DropzoneContainer
        description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
        title="Attach files to the conversation"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-col gap-3 py-8",
            isPodEmpty && "h-full"
          )}
        >
          <div className="flex w-full flex-col gap-3">
            <PodPinnedBanner owner={owner} podInfo={podInfo} />
            <div className="flex w-full items-center gap-2">
              <Icon visual={getSpaceIcon(podInfo)} />
              <h2
                className={cn(
                  "heading-2xl font-medium text-foreground",
                  podInfo.archivedAt && "text-muted-foreground"
                )}
              >
                {podInfo.name} - {greeting}
              </h2>
              {podInfo.archivedAt && (
                <Chip size="xs" color="warning" label="Archived" />
              )}
            </div>
            {podInfo.archivedAt ? (
              <div className="mx-auto flex w-full flex-col py-4 md:max-w-conversation">
                <EmptyCTA
                  message="This Pod is archived and no longer appears in your sidebar. You can still search for it and view past conversations, but you cannot start new ones."
                  action={null}
                />
              </div>
            ) : podInfo.isMember ? (
              <InputBar
                owner={owner}
                user={user}
                onSubmit={onSubmit}
                draftKey={`space-${podInfo.sId}-new-conversation`}
                space={podInfo}
                disableAutoFocus={false}
                isFloating={false}
                placeholder={`Get work done...`}
                defaultAgentId={defaultAgentId}
                isDefaultAgentLoading={isPodMetadataLoading}
                defaultSkills={defaultSkills}
                isDefaultSkillsLoading={isDefaultSkillsLoading}
              />
            ) : (
              <PodJoinCTA
                owner={owner}
                podId={podInfo.sId}
                podName={podInfo.name}
                isRestricted={podInfo.isRestricted}
                userName={user.fullName}
              />
            )}
          </div>

          {/* Suggestions for empty rooms */}
          {isPodEmpty ? (
            <div
              className={cn(
                "mx-auto flex w-full max-w-4xl flex-col gap-3 py-8 h-full justify-center"
              )}
            >
              <PodEmptyCallout
                owner={owner}
                podId={podInfo.sId}
                isEditor={isEditor}
                onNavigateToTasks={onNavigateToTasks}
              />
            </div>
          ) : (
            /* Space conversations section */
            <div className="w-full">
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center justify-between gap-3">
                  {!isSingleMemberPod && (
                    <ButtonsSwitchList
                      key={conversationFilter}
                      defaultValue={conversationFilter}
                      size={isWidthConstrained ? "xs" : "sm"}
                    >
                      <ButtonsSwitch
                        value="with_me"
                        label="Mine"
                        tooltip="Conversations where you have sent a message."
                        onClick={() => onConversationFilterChange("with_me")}
                      />
                      <ButtonsSwitch
                        value="group"
                        label="Group"
                        tooltip="Conversations with more than one person"
                        onClick={() => onConversationFilterChange("group")}
                      />
                      <ButtonsSwitch
                        value="all"
                        label="All"
                        tooltip="Every conversation in this Pod."
                        onClick={() => onConversationFilterChange("all")}
                      />
                    </ButtonsSwitchList>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    icon={hideTriggeredConversations ? Zap : ZapOff}
                    tooltip={
                      hideTriggeredConversations
                        ? "Show triggered"
                        : "Hide triggered"
                    }
                    className="shrink-0"
                    onClick={() =>
                      onHideTriggeredConversationsChange(
                        !hideTriggeredConversations
                      )
                    }
                  />
                  <SearchInputWithPopover
                    name="conversation-search"
                    value={searchText}
                    onChange={setSearchText}
                    placeholder={`Search...`}
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
                        getConversationDisplayTitle(conversation);
                      const time = moment(conversation.updated).fromNow();

                      return (
                        <div
                          className={cn(
                            "cursor-pointer px-3 py-2 hover:bg-primary-50",
                            selected && "bg-primary-100"
                          )}
                          onClick={() => navigateToConversation(conversation)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 truncate">
                              <div className="text-sm font-medium text-foreground">
                                {conversationLabel}
                              </div>
                            </div>
                            <div className="shrink-0 text-xs text-muted-foreground">
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
                    icon={CheckDouble}
                    label={isWidthConstrained ? undefined : "Mark all as read"}
                    className="shrink-0"
                    onClick={() => markAllAsRead(unreadConversationIds)}
                    isLoading={isMarkingAllAsRead}
                    disabled={unreadConversationIds.length === 0}
                  />
                </div>
                <div className="flex flex-col -mt-2">
                  {isConversationsLoading ? (
                    <>
                      <ListItemSection>
                        <LoadingBlock className="h-[24px] w-[80px]" />
                      </ListItemSection>
                      <ListGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <PodLoadingConversationListItem key={index} />
                        ))}
                      </ListGroup>
                    </>
                  ) : isFilteredEmpty ? (
                    <div className="px-3 py-8">
                      <EmptyCTA
                        message={noConversationsForFilterMessage}
                        action={null}
                      />
                    </div>
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
                          <ListGroup className="border-b-0 border-t-0">
                            {dateConversations
                              .toSorted((a, b) => b.updated - a.updated)
                              .map((conversation) => (
                                <PodConversationListItem
                                  key={conversation.id}
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
          )}
        </div>
      </DropzoneContainer>
    </div>
  );
}
