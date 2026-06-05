import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { StackedInAppBanners } from "@app/components/assistant/conversation/InAppBanner";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { renderPodsList } from "@app/components/assistant/conversation/sidebar/PodList";
import { PodsBrowsePopover } from "@app/components/assistant/conversation/sidebar/PodsBrowsePopover";
import { SidebarSearch } from "@app/components/assistant/conversation/sidebar/SidebarSearch";
import {
  filterTriggeredConversations,
  getGroupConversationsByDate,
  getGroupConversationsByUnreadAndActionRequired,
} from "@app/components/assistant/conversation/utils";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  usePodConversationsSummary,
  useSearchPodConversations,
  useSearchPrivateConversations,
} from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useDeleteConversation } from "@app/hooks/useDeleteConversation";
import { useHideTriggeredConversations } from "@app/hooks/useHideTriggeredConversations";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import {
  useBulkMoveConversationsToPod,
  useMoveConversationToPod,
} from "@app/hooks/useMoveConversationToPod";
import { useSendNotification } from "@app/hooks/useNotification";
import { usePodsSectionCollapsed } from "@app/hooks/usePodsSectionCollapsed";
import { useSearchPods } from "@app/hooks/useSearchPods";
import { useStarredPodsSectionCollapsed } from "@app/hooks/useStarredPodsSectionCollapsed";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { CONVERSATIONS_UPDATED_EVENT } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import { formatWakeUpSidebarLabel } from "@app/lib/utils/wakeup_description";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  type ConversationListItemType,
  getConversationDisplayTitle,
} from "@app/types/assistant/conversation";
import type { PodType, SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  ArrowRight,
  Avatar,
  Brackets,
  Button,
  Checkbox,
  CheckDone01,
  CheckDouble,
  Chip,
  Clock,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  File02,
  FolderOpen,
  Icon,
  Label,
  MagicWand02,
  MessagePlusCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
  Plus,
  Robot,
  Spinner,
  Star01,
  Trash01,
  XClose,
  Zap,
  ZapOff,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface AgentSidebarMenuProps {
  owner: WorkspaceType;
  hideActions?: boolean;
  hideInAppBanner?: boolean;
}

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface SearchPodItemProps {
  pod: PodType;
  owner: WorkspaceType;
  isMember: boolean;
  activePodId: string | null;
}

function SearchPodItem({
  pod,
  owner,
  isMember,
  activePodId: activePodId,
}: SearchPodItemProps) {
  const router = useAppRouter();
  const { setSidebarOpen } = useContext(SidebarContext);

  const isArchived = !!pod.archivedAt;

  return (
    <NavigationListItem
      selected={activePodId === pod.sId}
      icon={getSpaceIcon(pod)}
      label={pod.name}
      className={cn(!isMember && "italic")}
      onClick={async () => {
        setSidebarOpen(false);
        await router.push(getPodRoute(owner.sId, pod.sId));
      }}
      suffix={
        isArchived ? (
          <Chip size="mini" color="white" label="Archived" />
        ) : undefined
      }
    />
  );
}

interface SearchResultsProps {
  owner: WorkspaceType;
  allPods: Array<PodType>;
  isSearchingPods: boolean;
  hasMorePods: boolean;
  loadMorePods: () => void;
  isLoadingMorePods: boolean;
  podConversationResults: Array<
    ConversationWithoutContentType & { spaceName: string }
  >;
  privateConversations: ConversationWithoutContentType[];
  isSearchingPrivateConversations: boolean;
  hasMorePrivateConversations: boolean;
  loadMorePrivateConversations: () => void;
  isLoadingMorePrivateConversations: boolean;
  isSearchingPodConversations: boolean;
  onCreatePod: () => void;
  activeConversationId: string | null;
  activeSpaceId: string | null;
  hideTriggeredConversations: boolean;
  setHideTriggeredConversations: (hide: boolean) => void;
  isMultiSelect: boolean;
  selectedConversations: ConversationListItemType[];
  toggleConversationSelection: (c: ConversationListItemType) => void;
}

function SearchResults({
  owner,
  allPods,
  isSearchingPods,
  hasMorePods,
  loadMorePods,
  isLoadingMorePods,
  podConversationResults,
  privateConversations,
  isSearchingPrivateConversations,
  hasMorePrivateConversations,
  loadMorePrivateConversations,
  isLoadingMorePrivateConversations,
  isSearchingPodConversations: isSearchingPodConversations,
  onCreatePod,
  activeConversationId,
  activeSpaceId,
  hideTriggeredConversations,
  setHideTriggeredConversations,
  isMultiSelect,
  selectedConversations,
  toggleConversationSelection,
}: SearchResultsProps) {
  const [podsSectionOpen, setPodsSectionOpen] = useState(true);

  const allConversations = useMemo(() => {
    const seen = new Set<string>();
    const merged: Array<
      ConversationWithoutContentType & { spaceName: string | null }
    > = [];

    // Local keyword results first (immediate)
    for (const conv of privateConversations) {
      if (!seen.has(conv.sId)) {
        seen.add(conv.sId);
        merged.push({ ...conv, spaceName: null });
      }
    }

    // Semantic results second (when available)
    for (const conv of podConversationResults) {
      if (!seen.has(conv.sId)) {
        seen.add(conv.sId);
        merged.push(conv);
      }
    }

    // Filter triggered conversations after merging
    if (hideTriggeredConversations) {
      return merged.filter((c) => c.triggerId === null);
    }

    return merged;
  }, [
    privateConversations,
    podConversationResults,
    hideTriggeredConversations,
  ]);

  const hasTriggeredConversations = useMemo(
    () =>
      privateConversations.some((c) => c.triggerId !== null) ||
      podConversationResults.some((c) => c.triggerId !== null),
    [privateConversations, podConversationResults]
  );

  const handleShowMorePods = useCallback(() => {
    loadMorePods();
  }, [loadMorePods]);

  const handleShowMorePrivateConversations = useCallback(() => {
    loadMorePrivateConversations();
  }, [loadMorePrivateConversations]);

  const showPodsLoading = isSearchingPods && !isLoadingMorePods;
  const showConversationsLoading =
    (isSearchingPrivateConversations && !isLoadingMorePrivateConversations) ||
    isSearchingPodConversations;

  return (
    <div className="h-full overflow-y-auto">
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label="Pods"
          type="collapse"
          open={podsSectionOpen}
          onOpenChange={setPodsSectionOpen}
          action={
            <>
              <Button
                size="xs"
                icon={Plus}
                label="New"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCreatePod();
                }}
              />
              <PodsBrowsePopover owner={owner} />
            </>
          }
        >
          {showPodsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : allPods.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <>
              {allPods.map((pod) => (
                <SearchPodItem
                  key={pod.sId}
                  pod={pod}
                  owner={owner}
                  isMember={pod.isMember}
                  activePodId={activeSpaceId}
                />
              ))}
              {hasMorePods && (
                <div className="flex justify-center py-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    label={isLoadingMorePods ? "Loading..." : "Show more"}
                    onClick={handleShowMorePods}
                    disabled={isLoadingMorePods}
                  />
                </div>
              )}
            </>
          )}
        </NavigationListCollapsibleSection>
      </NavigationList>

      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label="Conversations"
          defaultOpen
          action={
            <>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xmini"
                    icon={DotsHorizontal}
                    variant="ghost"
                    aria-label="Conversations options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent onFocusOutside={(e) => e.preventDefault()}>
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label={
                      hideTriggeredConversations
                        ? "Show triggered"
                        : "Hide triggered"
                    }
                    icon={hideTriggeredConversations ? Zap : ZapOff}
                    disabled={!hasTriggeredConversations}
                    onClick={() =>
                      setHideTriggeredConversations(!hideTriggeredConversations)
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        >
          {allConversations.length === 0 && !showConversationsLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            allConversations.map((conv) => (
              <ConversationListItem
                key={conv.sId}
                conversation={conv}
                owner={owner}
                isMultiSelect={isMultiSelect}
                selectedConversations={selectedConversations}
                toggleConversationSelection={toggleConversationSelection}
                activeConversationId={activeConversationId}
              />
            ))
          )}
          {hasMorePrivateConversations && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="xs"
                label={
                  isLoadingMorePrivateConversations ? "Loading..." : "Show more"
                }
                onClick={handleShowMorePrivateConversations}
                disabled={isLoadingMorePrivateConversations}
              />
            </div>
          )}
          {showConversationsLoading && (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          )}
        </NavigationListCollapsibleSection>
      </NavigationList>
    </div>
  );
}

export function AgentSidebarMenu({
  owner,
  hideActions,
  hideInAppBanner,
}: AgentSidebarMenuProps) {
  const router = useAppRouter();
  const activeConversationId = useActiveConversationId();
  const activePodId = useActivePodId();
  const { hasFeature } = useFeatureFlags();
  const moveConversationToPod = useMoveConversationToPod(owner);
  const bulkMoveConversationsToPod = useBulkMoveConversationsToPod(owner);

  const { providersHealth } = useAuth();
  const noHealthyProviders = !hasHealthyProviders(providersHealth);

  const agentsSearchInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });
  const editableAgents = useMemo(
    () => agentConfigurations.filter((agent) => agent.canEdit),
    [agentConfigurations]
  );
  const filteredAgents = useMemo(
    () =>
      editableAgents
        .filter((agent) =>
          agent.name.toLowerCase().includes(searchText.toLowerCase().trim())
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [editableAgents, searchText]
  );

  const { setSidebarOpen } = useContext(SidebarContext);

  const {
    conversations,
    isConversationsError,
    mutateConversations,
    hasMore,
    loadMore,
    isLoadingMore,
  } = useConversations({ workspaceId: owner.sId });

  const {
    summary,
    isLoading: isSummaryLoading,
    mutate: mutatePodConversationSummary,
  } = usePodConversationsSummary({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    const handleConversationsUpdated = () => {
      void mutateConversations();
      void mutatePodConversationSummary();
    };
    window.addEventListener(
      CONVERSATIONS_UPDATED_EVENT,
      handleConversationsUpdated
    );
    return () => {
      window.removeEventListener(
        CONVERSATIONS_UPDATED_EVENT,
        handleConversationsUpdated
      );
    };
  }, [mutateConversations, mutatePodConversationSummary]);

  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    ConversationListItemType[]
  >([]);
  const doDelete = useDeleteConversation(owner);

  const { hideTriggeredConversations, setHideTriggeredConversations } =
    useHideTriggeredConversations();

  const { isPodsSectionCollapsed, setPodsSectionCollapsed } =
    usePodsSectionCollapsed();

  const { isStarredPodsSectionCollapsed, setStarredPodsSectionCollapsed } =
    useStarredPodsSectionCollapsed();

  const isRestrictedFromAgentCreation =
    hasFeature("disallow_agent_creation_to_users") && !isBuilder(owner);

  const [showDeleteDialog, setShowDeleteDialog] = useState<
    "all" | "selection" | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string>("");
  const [isCreatePodModalOpen, setIsCreatePodModalOpen] = useState(false);
  const [pendingMoveToNewPod, setPendingMoveToNewPod] = useState(false);
  const [isImportSkillDialogOpen, setIsImportSkillDialogOpen] = useState(false);

  const {
    pods,
    isSearching: isSearchingPods,
    hasMore: hasMorePods,
    loadMore: loadMorePods,
    isLoadingMore: isLoadingMorePods,
  } = useSearchPods({
    workspaceId: owner.sId,
    query: titleFilter,
    enabled: titleFilter.trim().length > 0,
  });

  const {
    conversations: podConversationSearchResults,
    isSearching: isSearchingPodConversations,
  } = useSearchPodConversations({
    workspaceId: owner.sId,
    query: titleFilter,
    enabled: titleFilter.trim().length > 0,
  });

  const {
    conversations: privateConversationSearchResults,
    isSearching: isSearchingPrivateConversations,
    hasMore: hasMorePrivateConversations,
    loadMore: loadMorePrivateConversations,
    isLoadingMore: isLoadingMorePrivateConversations,
  } = useSearchPrivateConversations({
    workspaceId: owner.sId,
    query: titleFilter,
    enabled: titleFilter.trim().length > 0,
  });

  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });
  const sendNotification = useSendNotification();

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const toggleMultiSelect = useCallback(() => {
    setIsMultiSelect((prev) => !prev);
    setSelectedConversations([]);
  }, [setIsMultiSelect, setSelectedConversations]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const toggleConversationSelection = useCallback(
    (c: ConversationListItemType) => {
      if (selectedConversations.includes(c)) {
        setSelectedConversations((prev) => prev.filter((id) => id !== c));
      } else {
        setSelectedConversations((prev) => [...prev, c]);
      }
    },
    [selectedConversations, setSelectedConversations]
  );

  const deleteSelection = useCallback(async () => {
    setIsDeleting(true);
    const total = selectedConversations.length;
    let successCount = 0;
    if (total > 0) {
      for (const conversation of selectedConversations) {
        const ok = await doDelete(conversation);
        if (ok) {
          successCount += 1;
        }
      }
      toggleMultiSelect();
    }
    setIsDeleting(false);
    setShowDeleteDialog(null);
    if (!total) {
      return;
    }
    if (successCount === total) {
      sendNotification({
        type: "success",
        title: "Conversations successfully deleted",
        description: `${total} conversation${total > 1 ? "s" : ""} have been deleted.`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: "Failed to delete conversations",
        description: `Could not delete the selected ${total > 1 ? "conversations" : "conversation"}.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: "Some conversations couldn’t be deleted",
        description: `Deleted ${successCount} of ${total} conversations.`,
      });
    }
  }, [doDelete, selectedConversations, sendNotification, toggleMultiSelect]);

  const availablePods = useMemo(
    () => summary.map(({ space }) => space),
    [summary]
  );

  const moveSelectionToPod = useCallback(
    async (pod: PodType | SpaceType) => {
      setIsMoving(true);
      const successCount = await bulkMoveConversationsToPod(
        selectedConversations,
        pod
      );
      setIsMoving(false);
      if (successCount > 0) {
        toggleMultiSelect();
      }
      return successCount;
    },
    [bulkMoveConversationsToPod, selectedConversations, toggleMultiSelect]
  );

  const deleteAll = useCallback(async () => {
    setIsDeleting(true);
    const total = conversations.length;
    let successCount = 0;
    for (const conversation of conversations) {
      const ok = await doDelete(conversation);
      if (ok) {
        successCount += 1;
      }
    }
    if (!total) {
      return;
    }
    if (successCount === total) {
      sendNotification({
        type: "success",
        title: "Conversations successfully deleted",
        description: `${total} conversation${total > 1 ? "s" : ""} have been deleted.`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: "Failed to delete conversations",
        description: "Could not delete conversation history.",
      });
    } else {
      sendNotification({
        type: "error",
        title: "Some conversations couldn’t be deleted",
        description: `Deleted ${successCount} of ${total} conversations.`,
      });
    }
    setIsDeleting(false);
    setShowDeleteDialog(null);
  }, [conversations, doDelete, sendNotification]);

  const { setAnimate } = useContext(InputBarContext);

  const handleNewClick = useCallback(async () => {
    setSidebarOpen(false);
    const { cId } = router.query;
    const isNewConversation =
      (router.pathname === "/w/[wId]/conversation/[cId]" ||
        router.pathname.match(/^\/w\/[^/]+\/conversation\/[^/]+$/)) &&
      typeof cId === "string" &&
      cId === "new";
    if (isNewConversation) {
      setAnimate(true);
    }
  }, [setSidebarOpen, router, setAnimate]);

  const hasTriggeredConversations = useMemo(
    () =>
      conversations.some((c: ConversationListItemType) => c.triggerId !== null),
    [conversations]
  );

  const filteredConversations = useMemo(() => {
    return filterTriggeredConversations(
      conversations,
      hideTriggeredConversations
    );
  }, [conversations, hideTriggeredConversations]);

  const isSearchActive = titleFilter.trim().length > 0;

  const sidebarTitleFilter = titleFilter;

  const starredSection = useMemo(() => {
    const starredSummary = summary.filter(({ space }) => space.isStarred);
    const starredCountInSummary = starredSummary.length;

    if (starredCountInSummary === 0) {
      return null;
    }

    const showCount =
      isStarredPodsSectionCollapsed && starredCountInSummary > 0;

    const VISIBLE_STARRED = 5;
    const hiddenStarredSummary = starredSummary.slice(VISIBLE_STARRED);
    const hiddenOverflowCount = hiddenStarredSummary.reduce(
      (sum, s) => sum + s.unreadConversations.length,
      0
    );
    const hiddenOverflowHasActivity = hiddenStarredSummary.some(
      (s) =>
        s.unreadConversations.length > 0 ||
        s.nonParticipantUnreadConversations.length > 0
    );

    return (
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label={showCount ? `Starred (${starredCountInSummary})` : "Starred"}
          icon={Star01}
          type="collapse"
          visibleItems={VISIBLE_STARRED}
          overflowCount={hiddenOverflowCount}
          overflowHasActivity={hiddenOverflowHasActivity}
          open={!isStarredPodsSectionCollapsed}
          onOpenChange={(open) => setStarredPodsSectionCollapsed(!open)}
        >
          {renderPodsList({
            owner,
            summary: starredSummary,
            titleFilter: sidebarTitleFilter,
            moveConversationToPod: moveConversationToPod,
          })}
        </NavigationListCollapsibleSection>
      </NavigationList>
    );
  }, [
    summary,
    owner,
    sidebarTitleFilter,
    moveConversationToPod,
    isStarredPodsSectionCollapsed,
    setStarredPodsSectionCollapsed,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const podsSection = useMemo(() => {
    const nonStarredSummary = summary.filter((pod) => !pod.space.isStarred);
    const podCountInSummary = nonStarredSummary.length;
    const showCount = isPodsSectionCollapsed && podCountInSummary > 0;

    const VISIBLE_PODS = 4;
    const hiddenSummary = nonStarredSummary.slice(VISIBLE_PODS);
    const hiddenOverflowCount = hiddenSummary.reduce(
      (sum, s) => sum + s.unreadConversations.length,
      0
    );
    const hiddenOverflowHasActivity = hiddenSummary.some(
      (s) =>
        s.unreadConversations.length > 0 ||
        s.nonParticipantUnreadConversations.length > 0
    );

    return (
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label={showCount ? `Pods (${podCountInSummary})` : "Pods"}
          type="collapse"
          visibleItems={VISIBLE_PODS}
          overflowCount={hiddenOverflowCount}
          overflowHasActivity={hiddenOverflowHasActivity}
          open={!isPodsSectionCollapsed}
          onOpenChange={(open) => setPodsSectionCollapsed(!open)}
          action={
            <>
              {nonStarredSummary.length > 0 && (
                <Button
                  size="xs"
                  icon={Plus}
                  label="New"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCreatePodModalOpen(true);
                  }}
                />
              )}
              <PodsBrowsePopover owner={owner} />
            </>
          }
        >
          {isSummaryLoading ? (
            <div className="flex items-center justify-center">
              <Spinner size="xs" />
            </div>
          ) : nonStarredSummary.length > 0 ? (
            renderPodsList({
              owner,
              summary: nonStarredSummary,
              titleFilter: sidebarTitleFilter,
              moveConversationToPod: moveConversationToPod,
            })
          ) : (
            <NavigationListItem
              label="Create a Pod"
              icon={Plus}
              onClick={() => setIsCreatePodModalOpen(true)}
            />
          )}
        </NavigationListCollapsibleSection>
      </NavigationList>
    );
  }, [
    owner,
    summary,
    setIsCreatePodModalOpen,
    isPodsSectionCollapsed,
    setPodsSectionCollapsed,
    isSummaryLoading,
    sidebarTitleFilter,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const conversationsList = useMemo(() => {
    return (
      <NavigationListWithInbox
        conversations={filteredConversations}
        titleFilter={sidebarTitleFilter}
        isMultiSelect={isMultiSelect}
        selectedConversations={selectedConversations}
        toggleConversationSelection={toggleConversationSelection}
        activeConversationId={activeConversationId}
        owner={owner}
        starredSection={starredSection}
        podsSection={podsSection}
        hasTriggeredConversations={hasTriggeredConversations}
        hideTriggeredConversations={hideTriggeredConversations}
        setHideTriggeredConversations={setHideTriggeredConversations}
        handleNewClick={handleNewClick}
        toggleMultiSelect={toggleMultiSelect}
        setShowDeleteDialog={setShowDeleteDialog}
        hasMore={hasMore}
        loadMore={loadMore}
        isLoadingMore={isLoadingMore}
      />
    );
  }, [
    filteredConversations,
    sidebarTitleFilter,
    isMultiSelect,
    selectedConversations,
    toggleConversationSelection,
    activeConversationId,
    owner,
    starredSection,
    podsSection,
    hasTriggeredConversations,
    hideTriggeredConversations,
    setHideTriggeredConversations,
    handleNewClick,
    toggleMultiSelect,
    setShowDeleteDialog,
    hasMore,
    loadMore,
    isLoadingMore,
  ]);

  return (
    <>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog !== null}
        isDeleting={isDeleting}
        onClose={() => setShowDeleteDialog(null)}
        onDelete={showDeleteDialog === "all" ? deleteAll : deleteSelection}
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        type={showDeleteDialog || "all"}
        selectedCount={selectedConversations.length}
      />
      <CreatePodModal
        isOpen={isCreatePodModalOpen}
        onClose={() => {
          setIsCreatePodModalOpen(false);
          setPendingMoveToNewPod(false);
        }}
        onCreated={async (pod) => {
          setSidebarOpen(false);
          if (pendingMoveToNewPod) {
            setPendingMoveToNewPod(false);
            await moveSelectionToPod(pod);
          }
          void router.push(getPodRoute(owner.sId, pod.sId));
        }}
        owner={owner}
      />
      {isImportSkillDialogOpen && (
        <ImportSkillsDialog
          onClose={() => setIsImportSkillDialogOpen(false)}
          owner={owner}
        />
      )}
      <div className="flex grow flex-col">
        <div className="flex h-0 min-h-full w-full">
          <div className="flex w-full flex-col">
            {isMultiSelect ? (
              <div className="z-50 flex justify-between gap-2 border-b border-border-dark/60 p-2 dark:border-border-dark/60">
                <div className="flex gap-2">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        label="Move to Pod"
                        icon={ArrowRight}
                        disabled={selectedConversations.length === 0}
                        isLoading={isMoving}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="max-w-60"
                      onFocusOutside={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        icon={Plus}
                        label="New Pod"
                        onClick={() => {
                          setPendingMoveToNewPod(true);
                          setIsCreatePodModalOpen(true);
                        }}
                      />
                      {availablePods.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel label="Pods" />
                          {availablePods.map((pod) => (
                            <DropdownMenuItem
                              key={pod.sId}
                              icon={getSpaceIcon(pod)}
                              label={pod.name}
                              truncateText
                              onClick={() => moveSelectionToPod(pod)}
                            />
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant={
                      selectedConversations.length === 0 ? "outline" : "warning"
                    }
                    label="Delete"
                    disabled={selectedConversations.length === 0}
                    onClick={() => setShowDeleteDialog("selection")}
                  />
                </div>
                <Button
                  variant="ghost"
                  icon={XClose}
                  onClick={toggleMultiSelect}
                />
              </div>
            ) : (
              <div className="z-50 flex justify-end gap-2 p-2">
                <div className="flex-1">
                  <SidebarSearch
                    titleFilter={titleFilter}
                    onTitleFilterChange={setTitleFilter}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    label="New"
                    href={getConversationRoute(owner.sId)}
                    icon={MessagePlusCircle}
                    className="shrink-0"
                    tooltip="Create a new conversation"
                    onClick={handleNewClick}
                  />
                  {!hideActions && (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          icon={DotsHorizontal}
                          variant="outline"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {!isRestrictedFromAgentCreation && (
                          <>
                            <DropdownMenuLabel>Agents</DropdownMenuLabel>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger
                                icon={Plus}
                                label="New agent"
                                disabled={noHealthyProviders}
                              />
                              <DropdownMenuPortal>
                                <DropdownMenuSubContent className="pointer-events-auto">
                                  <DropdownMenuItem
                                    href={getAgentBuilderRoute(
                                      owner.sId,
                                      "new"
                                    )}
                                    icon={File02}
                                    label="From scratch"
                                    data-gtm-label="assistantCreationButton"
                                    data-gtm-location="sidebarMenu"
                                    onClick={withTracking(
                                      TRACKING_AREAS.BUILDER,
                                      "create_from_scratch"
                                    )}
                                  />
                                  <DropdownMenuItem
                                    href={getAgentBuilderRoute(
                                      owner.sId,
                                      "create"
                                    )}
                                    icon={MagicWand02}
                                    label="From template"
                                    data-gtm-label="assistantCreationButton"
                                    data-gtm-location="sidebarMenu"
                                    onClick={withTracking(
                                      TRACKING_AREAS.BUILDER,
                                      "create_from_template"
                                    )}
                                  />
                                  <DropdownMenuItem
                                    icon={
                                      isUploadingYAML ? (
                                        <Spinner size="xs" />
                                      ) : (
                                        Brackets
                                      )
                                    }
                                    label={
                                      isUploadingYAML
                                        ? "Uploading..."
                                        : "From YAML"
                                    }
                                    disabled={isUploadingYAML}
                                    onClick={triggerYAMLUpload}
                                    data-gtm-label="yamlUploadButton"
                                    data-gtm-location="sidebarMenu"
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuPortal>
                            </DropdownMenuSub>
                            {editableAgents.length > 0 && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger
                                  icon={Edit04}
                                  label="Edit agent"
                                  disabled={noHealthyProviders}
                                />
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent className="pointer-events-auto">
                                    <DropdownMenuSearchbar
                                      ref={agentsSearchInputRef}
                                      name="search"
                                      value={searchText}
                                      onChange={setSearchText}
                                      placeholder="Search"
                                    />
                                    <div className="max-h-150 overflow-y-auto">
                                      {filteredAgents.map((agent) => (
                                        <DropdownMenuItem
                                          key={agent.sId}
                                          href={getAgentBuilderRoute(
                                            owner.sId,
                                            agent.sId
                                          )}
                                          truncateText
                                          label={agent.name}
                                          icon={() => (
                                            <Avatar
                                              size="xs"
                                              visual={agent.pictureUrl}
                                            />
                                          )}
                                        />
                                      ))}
                                    </div>
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>
                            )}
                            <DropdownMenuItem
                              href={getAgentBuilderRoute(owner.sId, "manage")}
                              icon={Robot}
                              label="Manage agents"
                              data-gtm-label="assistantManagementButton"
                              data-gtm-location="sidebarMenu"
                              onClick={withTracking(
                                TRACKING_AREAS.BUILDER,
                                "manage_agents"
                              )}
                            />
                          </>
                        )}
                        {isBuilder(owner) && (
                          <>
                            <DropdownMenuLabel>Skills</DropdownMenuLabel>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger
                                icon={Plus}
                                label="New skill"
                              />
                              <DropdownMenuSubContent>
                                <DropdownMenuItem
                                  href={getSkillBuilderRoute(owner.sId, "new")}
                                  icon={SKILL_ICON}
                                  label="From scratch"
                                />
                                <DropdownMenuItem
                                  icon={FolderOpen}
                                  label="From existing"
                                  onClick={() =>
                                    setIsImportSkillDialogOpen(true)
                                  }
                                />
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem
                              href={getSkillBuilderRoute(owner.sId, "manage")}
                              icon={SKILL_ICON}
                              label="Manage skills"
                            />
                          </>
                        )}
                        <DropdownMenuLabel>Conversations</DropdownMenuLabel>
                        <DropdownMenuItem
                          label="Edit conversations"
                          onClick={toggleMultiSelect}
                          icon={CheckDone01}
                          disabled={filteredConversations.length === 0}
                        />
                        <DropdownMenuItem
                          label="Clear conversation history"
                          onClick={() => setShowDeleteDialog("all")}
                          icon={Trash01}
                          disabled={filteredConversations.length === 0}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )}
            {isConversationsError && (
              <Label className="px-3 py-4 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                Error loading conversations
              </Label>
            )}
            {isSearchActive ? (
              <SearchResults
                owner={owner}
                allPods={pods}
                isSearchingPods={isSearchingPods}
                hasMorePods={hasMorePods}
                loadMorePods={loadMorePods}
                isLoadingMorePods={isLoadingMorePods}
                podConversationResults={podConversationSearchResults}
                privateConversations={privateConversationSearchResults}
                isSearchingPrivateConversations={
                  isSearchingPrivateConversations
                }
                hasMorePrivateConversations={hasMorePrivateConversations}
                loadMorePrivateConversations={loadMorePrivateConversations}
                isLoadingMorePrivateConversations={
                  isLoadingMorePrivateConversations
                }
                isSearchingPodConversations={isSearchingPodConversations}
                onCreatePod={() => setIsCreatePodModalOpen(true)}
                activeConversationId={activeConversationId}
                activeSpaceId={activePodId}
                hideTriggeredConversations={hideTriggeredConversations}
                setHideTriggeredConversations={setHideTriggeredConversations}
                isMultiSelect={isMultiSelect}
                selectedConversations={selectedConversations}
                toggleConversationSelection={toggleConversationSelection}
              />
            ) : (
              conversationsList
            )}

            {!hideInAppBanner && (
              <StackedInAppBanners
                owner={owner}
                onCreatePod={() => setIsCreatePodModalOpen(true)}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface UnreadConversationsSectionProps {
  label: string;
  conversations: ConversationListItemType[];
  isMultiSelect: boolean;
  isMarkingAllAsRead: boolean;
  onMarkAllAsRead: (conversationIds: string[]) => void;
  selectedConversations: ConversationListItemType[];
  toggleConversationSelection: (c: ConversationListItemType) => void;
  activeConversationId: string | null;
  owner: WorkspaceType;
  titleFilter: string;
}

interface ConversationListContainerProps {
  children: React.ReactNode;
}

const ConversationListContainer = ({
  children,
}: ConversationListContainerProps) => {
  return <div className="sm:flex sm:flex-col sm:gap-0.5">{children}</div>;
};

const GRID_ANIMATE = { gridTemplateRows: "1fr", opacity: 1 };
const GRID_EXIT = { gridTemplateRows: "0fr", opacity: 0 };
const GRID_STYLE = { display: "grid" } as const;

function UnreadConversationsSection({
  label,
  conversations,
  isMultiSelect,
  isMarkingAllAsRead,
  titleFilter,
  onMarkAllAsRead,
  selectedConversations,
  toggleConversationSelection,
  activeConversationId,
  owner,
}: UnreadConversationsSectionProps) {
  const totalCount = conversations.length;

  const shouldShowMarkAllAsReadButton =
    totalCount > 0 && titleFilter.length === 0 && !isMultiSelect;

  return (
    <NavigationListCollapsibleSection
      label={`${label} (${totalCount})`}
      className="border-b border-t border-border bg-background/50 px-2 pb-2 dark:border-border-night dark:bg-background-night/50"
      defaultOpen
      actionOnHover={false}
      action={
        shouldShowMarkAllAsReadButton ? (
          <Button
            size="xmini"
            variant="ghost"
            icon={CheckDouble}
            tooltip="Mark all as read"
            onClick={() => onMarkAllAsRead(conversations.map((c) => c.sId))}
            isLoading={isMarkingAllAsRead}
          />
        ) : null
      }
    >
      <AnimatePresence initial={false}>
        {conversations.map((conversation) => (
          <motion.div
            key={conversation.sId}
            style={GRID_STYLE}
            animate={GRID_ANIMATE}
            exit={GRID_EXIT}
            transition={{ ease: "easeOut", duration: 0.1 }}
          >
            <div className="overflow-hidden">
              <ConversationListItem
                key={conversation.sId}
                conversation={conversation}
                isMultiSelect={isMultiSelect}
                selectedConversations={selectedConversations}
                toggleConversationSelection={toggleConversationSelection}
                activeConversationId={activeConversationId}
                owner={owner}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </NavigationListCollapsibleSection>
  );
}

const ConversationList = ({
  conversations,
  dateLabel,
  ...props
}: {
  conversations: ConversationListItemType[];
  dateLabel: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationListItemType[];
  toggleConversationSelection: (c: ConversationListItemType) => void;
  activeConversationId: string | null;
  owner: WorkspaceType;
}) => {
  if (!conversations.length) {
    return null;
  }

  return (
    <ConversationListContainer>
      {dateLabel !== "Today" && (
        <NavigationListLabel
          label={dateLabel}
          isSticky
          className="bg-muted-background dark:bg-muted-background-night"
        />
      )}

      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.sId}
          conversation={conversation}
          {...props}
        />
      ))}
    </ConversationListContainer>
  );
};

interface WakeUpSuffixProps {
  nextWakeupAt: number;
}

function WakeUpSuffix({ nextWakeupAt }: WakeUpSuffixProps) {
  return (
    <span className="copy-xs flex items-center gap-1 text-muted-foreground dark:text-muted-foreground-night">
      <Icon visual={Clock} size="xs" />
      {formatWakeUpSidebarLabel(nextWakeupAt)}
    </span>
  );
}

const ConversationListItem = memo(
  ({
    conversation,
    isMultiSelect,
    selectedConversations,
    toggleConversationSelection,
    activeConversationId,
    owner,
  }: {
    conversation: ConversationListItemType;
    isMultiSelect: boolean;
    selectedConversations: ConversationListItemType[];
    toggleConversationSelection: (c: ConversationListItemType) => void;
    activeConversationId: string | null;
    owner: WorkspaceType;
  }) => {
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
    const {
      isMenuOpen,
      menuTriggerPosition,
      handleRightClick,
      handleMenuOpenChange,
    } = useConversationMenu();

    const [showTypingAnimation, setShowTypingAnimation] = useState(false);
    const titleRef = useRef<string | null>(conversation.title); // Used to detect when the title changes to show the typing animation.

    useLayoutEffect(() => {
      if (titleRef.current === null && conversation.title !== null) {
        setShowTypingAnimation(true);
      }
      titleRef.current = conversation.title;
    }, [conversation.title]);

    const handleTypingAnimationComplete = useCallback(() => {
      setShowTypingAnimation(false);
    }, []);

    const conversationLabel = getConversationDisplayTitle(conversation);

    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        // Only allow dragging if not in multi-select mode and conversation is not already in a pod
        if (isMultiSelect || conversation.spaceId) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", conversation.sId);
        // Add a custom data type to identify conversation drags
        e.dataTransfer.setData(
          "application/x-dust-conversation",
          conversation.sId
        );
        // Store the full conversation object as JSON for the drop handler
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify(conversation)
        );
      },
      [conversation, isMultiSelect]
    );

    return isMultiSelect ? (
      <div className="flex items-center px-2 py-2">
        <Checkbox
          id={`conversation-${conversation.sId}`}
          className="bg-background dark:bg-background-night"
          checked={selectedConversations.includes(conversation)}
          onCheckedChange={() => toggleConversationSelection(conversation)}
        />
        <Label
          htmlFor={`conversation-${conversation.sId}`}
          className="copy-sm ml-2 text-muted-foreground dark:text-muted-foreground-night"
        >
          {conversationLabel}
        </Label>
      </div>
    ) : (
      <NavigationListItem
        key={conversation.sId}
        selected={activeConversationId === conversation.sId}
        status={getConversationDotStatus(conversation)}
        label={conversationLabel}
        labelAnimation={
          showTypingAnimation
            ? "typing"
            : conversation.isRunningAgentLoop
              ? "streaming"
              : "none"
        }
        onTypingAnimationComplete={handleTypingAnimationComplete}
        href={getConversationRoute(owner.sId, conversation.sId)}
        shallow
        draggable={!conversation.spaceId}
        onDragStart={handleDragStart}
        className={
          !conversation.spaceId
            ? "cursor-grab active:cursor-grabbing"
            : undefined
        }
        suffix={
          conversation.nextWakeupAt ? (
            <WakeUpSuffix nextWakeupAt={conversation.nextWakeupAt} />
          ) : undefined
        }
        moreMenu={
          <ConversationMenu
            activeConversationId={conversation.sId}
            conversation={conversation}
            owner={owner}
            trigger={() => <NavigationListItemAction />}
            isConversationDisplayed={activeConversationId === conversation.sId}
            isOpen={isMenuOpen}
            onOpenChange={handleMenuOpenChange}
            triggerPosition={menuTriggerPosition}
          />
        }
        onContextMenu={handleRightClick}
        onClick={async () => {
          // Side bar is the floating sidebar that appears when the screen is small.
          if (sidebarOpen) {
            setSidebarOpen(false);
            // Wait a bit before moving to the new conversation to avoid the sidebar from flickering.
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }}
      />
    );
  }
);

interface NavigationListWithInboxProps {
  conversations: ConversationListItemType[];
  titleFilter: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationListItemType[];
  toggleConversationSelection: (conversation: ConversationListItemType) => void;
  activeConversationId: string | null;
  owner: WorkspaceType;
  starredSection?: React.ReactNode;
  podsSection?: React.ReactNode;
  hasTriggeredConversations: boolean;
  hideTriggeredConversations: boolean;
  setHideTriggeredConversations: (hide: boolean) => void;
  handleNewClick: () => void;
  toggleMultiSelect: () => void;
  setShowDeleteDialog: (value: "all" | "selection" | null) => void;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
}

function NavigationListWithInbox({
  conversations,
  titleFilter,
  isMultiSelect,
  selectedConversations,
  toggleConversationSelection,
  activeConversationId,
  owner,
  starredSection,
  podsSection,
  hasTriggeredConversations,
  hideTriggeredConversations,
  setHideTriggeredConversations,
  handleNewClick,
  toggleMultiSelect,
  setShowDeleteDialog,
  hasMore,
  loadMore,
  isLoadingMore,
}: NavigationListWithInboxProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    readConversations,
    inboxConversations,
    skillSuggestionConversations,
  } = useMemo(() => {
    return getGroupConversationsByUnreadAndActionRequired(
      conversations,
      titleFilter
    );
  }, [conversations, titleFilter]);

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate = readConversations?.length
    ? getGroupConversationsByDate({
        conversations: readConversations,
        titleFilter,
      })
    : ({} as Record<GroupLabel, ConversationListItemType[]>);

  const conversationsContent = (
    <>
      {Object.keys(conversationsByDate).map((dateLabel) => (
        <ConversationList
          key={dateLabel}
          conversations={conversationsByDate[dateLabel as GroupLabel]}
          dateLabel={dateLabel}
          isMultiSelect={isMultiSelect}
          selectedConversations={selectedConversations}
          toggleConversationSelection={toggleConversationSelection}
          activeConversationId={activeConversationId}
          owner={owner}
        />
      ))}
      <InfiniteScroll
        nextPage={loadMore}
        hasMore={hasMore}
        showLoader={isLoadingMore}
        options={{ root: scrollContainerRef.current, rootMargin: "400px" }}
        loader={
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        }
      />
    </>
  );

  return (
    <div
      ref={scrollContainerRef}
      className="dd-privacy-mask h-full w-full overflow-y-auto"
    >
      <AnimatePresence initial={false}>
        {skillSuggestionConversations.length > 0 && (
          <motion.div
            key="skill-suggestions"
            style={GRID_STYLE}
            animate={GRID_ANIMATE}
            exit={GRID_EXIT}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="overflow-hidden">
              <UnreadConversationsSection
                label="Skill suggestions"
                conversations={skillSuggestionConversations}
                isMultiSelect={isMultiSelect}
                isMarkingAllAsRead={isMarkingAllAsRead}
                titleFilter={titleFilter}
                onMarkAllAsRead={markAllAsRead}
                selectedConversations={selectedConversations}
                toggleConversationSelection={toggleConversationSelection}
                activeConversationId={activeConversationId}
                owner={owner}
              />
            </div>
          </motion.div>
        )}
        {inboxConversations.length > 0 && (
          <motion.div
            key="inbox"
            style={GRID_STYLE}
            animate={{ gridTemplateRows: "1fr" }}
            exit={{ gridTemplateRows: "0fr" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="overflow-hidden">
              <UnreadConversationsSection
                label="Inbox"
                conversations={inboxConversations}
                isMultiSelect={isMultiSelect}
                isMarkingAllAsRead={isMarkingAllAsRead}
                titleFilter={titleFilter}
                onMarkAllAsRead={markAllAsRead}
                selectedConversations={selectedConversations}
                toggleConversationSelection={toggleConversationSelection}
                activeConversationId={activeConversationId}
                owner={owner}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {starredSection}
      {podsSection}
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label="Conversations"
          defaultOpen
          action={
            <>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xmini"
                    icon={DotsHorizontal}
                    variant="ghost"
                    aria-label="Conversations options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent onFocusOutside={(e) => e.preventDefault()}>
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label={
                      hideTriggeredConversations
                        ? "Show triggered"
                        : "Hide triggered"
                    }
                    icon={hideTriggeredConversations ? Zap : ZapOff}
                    disabled={!hasTriggeredConversations}
                    onClick={() =>
                      setHideTriggeredConversations(!hideTriggeredConversations)
                    }
                  />
                  <DropdownMenuItem
                    label="Edit history"
                    icon={CheckDone01}
                    onClick={toggleMultiSelect}
                    disabled={conversations.length === 0}
                  />
                  <DropdownMenuItem
                    label="Clear history"
                    variant="warning"
                    icon={Trash01}
                    onClick={() => setShowDeleteDialog("all")}
                    disabled={conversations.length === 0}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        >
          {conversationsContent}
        </NavigationListCollapsibleSection>
      </NavigationList>
    </div>
  );
}
