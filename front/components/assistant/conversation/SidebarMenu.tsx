import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { CreateAgentDropdownContent } from "@app/components/assistant/CreateAgentDropdown";
import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { StackedInAppBanners } from "@app/components/assistant/conversation/InAppBanner";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { renderPodsList } from "@app/components/assistant/conversation/sidebar/PodList";
import { PodsBrowsePopover } from "@app/components/assistant/conversation/sidebar/PodsBrowsePopover";
import { SidebarSearch } from "@app/components/assistant/conversation/sidebar/SidebarSearch";
import {
  filterReadTriggeredConversations,
  getGroupConversationsByDate,
  getGroupConversationsByUnreadAndActionRequired,
  groupUnreadConversations,
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
import { useConversationsSectionCollapsed } from "@app/hooks/useConversationsSectionCollapsed";
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
import { useAuth } from "@app/lib/auth/AuthContext";
import { CONVERSATIONS_UPDATED_EVENT } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import {
  useActivationPod,
  useActivationRecommendations,
} from "@app/lib/swr/activation";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getGetStartedRoute,
  getPodRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import { formatWakeUpSidebarLabel } from "@app/lib/utils/wakeup_description";
import type {
  ConversationListItemType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { PodListItemType, PodType, SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  ArrowRight,
  Button,
  Checkbox,
  CheckDone01,
  Chip,
  Clock,
  Counter,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FolderOpen,
  Icon,
  Label,
  Lightbulb04,
  MessagePlusCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
  Plus,
  Robot,
  ScrollArea,
  Spinner,
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

// To avoid overwhelming the user with unread pod conversations, we hide them if there are too many.
const HIDE_UNREAD_POD_CONVERSATIONS_TRESHOLD = 16;

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
          <Chip size="mini" color="primary" label="Archived" />
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
  const [conversationsSectionOpen, setConversationsSectionOpen] =
    useState(true);

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
      <NavigationList className="mx-sidebar-side-spacing">
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
                variant="ghost-secondary"
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
                    variant="ghost-secondary"
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

      <NavigationList className="mx-sidebar-side-spacing">
        <NavigationListCollapsibleSection
          label="Conversations"
          type="collapse"
          open={conversationsSectionOpen}
          onOpenChange={setConversationsSectionOpen}
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
                variant="ghost-secondary"
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
  const { hasPermission } = useWorkspacePermissions();
  const moveConversationToPod = useMoveConversationToPod(owner);
  const bulkMoveConversationsToPod = useBulkMoveConversationsToPod(owner);

  const { providersHealth } = useAuth();
  const noHealthyProviders = !hasHealthyProviders(providersHealth);
  const { activationPodId } = useActivationPod({
    workspaceId: owner.sId,
  });
  const showGetStarted = activationPodId !== null;
  const { recommendations: activationRecsForBadge } =
    useActivationRecommendations({
      workspaceId: owner.sId,
      podId: activationPodId ?? undefined,
      disabled: !showGetStarted,
    });

  const [podSearchText, setPodSearchText] = useState("");
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

  // Hide the Learning Space pod from the UI. Users can only see "For you"
  const visibleSummary = useMemo(
    () => summary.filter(({ space }) => space.sId !== activationPodId),
    [summary, activationPodId]
  );

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

  const canCreateAgent = hasPermission("create", "agent");
  const canCreateSkill = hasPermission("create", "skill");

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
    () =>
      visibleSummary
        .map(({ space }) => space)
        .filter((space) =>
          space.name.toLowerCase().includes(podSearchText.toLowerCase().trim())
        ),
    [visibleSummary, podSearchText]
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

  const { setShouldFocusInput } = useContext(InputBarContext);

  const handleNewClick = useCallback(async () => {
    setSidebarOpen(false);
    // Already on the new-conversation page: clicking "New" doesn't navigate, so
    // the input bar isn't remounted and mount-time autofocus won't run. Request
    // an explicit refocus instead. (activeConversationId is null on "new".)
    const isNewConversation =
      router.pathname.match(/^\/w\/[^/]+\/conversation\/[^/]+$/) !== null &&
      activeConversationId === null;
    if (isNewConversation) {
      setShouldFocusInput(true);
    }
  }, [setSidebarOpen, router, activeConversationId, setShouldFocusInput]);

  const { allConversations, spaces } = useMemo(() => {
    const unreadPodConversations = summary
      .map(({ unreadConversations }) => unreadConversations)
      .flat();
    if (
      unreadPodConversations.length >= HIDE_UNREAD_POD_CONVERSATIONS_TRESHOLD
    ) {
      return {
        allConversations: conversations,
        spaces: summary.map(({ space }) => space).flat(),
      };
    }
    return {
      allConversations: [...conversations, ...unreadPodConversations],
      spaces: summary.map(({ space }) => space).flat(),
    };
  }, [conversations, summary]);

  const hasTriggeredConversations = useMemo(
    () =>
      allConversations.some(
        (c: ConversationListItemType) => c.triggerId !== null
      ),
    [allConversations]
  );

  const filteredConversations = useMemo(() => {
    return filterReadTriggeredConversations(
      allConversations,
      hideTriggeredConversations
    );
  }, [allConversations, hideTriggeredConversations]);

  const isSearchActive = titleFilter.trim().length > 0;

  const sidebarTitleFilter = titleFilter;

  const starredSection = useMemo(() => {
    const starredSummary = visibleSummary.filter(
      ({ space }) => space.isStarred
    );
    const starredCountInSummary = starredSummary.length;

    if (starredCountInSummary === 0) {
      return null;
    }

    const VISIBLE_STARRED = 5;
    const hiddenStarredSummary = starredSummary.slice(VISIBLE_STARRED);
    const hiddenOverflowCount = hiddenStarredSummary.reduce(
      (sum, s) => sum + s.unreadConversations.length,
      0
    );
    const hiddenOverflowHasActivity = hiddenStarredSummary.some(
      (s) =>
        s.unreadConversations.length > 0 ||
        s.nonParticipantUnreadConversationIds.length > 0
    );

    return (
      <NavigationList className="mx-sidebar-side-spacing">
        <NavigationListCollapsibleSection
          label="Starred"
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
    visibleSummary,
    owner,
    sidebarTitleFilter,
    moveConversationToPod,
    isStarredPodsSectionCollapsed,
    setStarredPodsSectionCollapsed,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const podsSection = useMemo(() => {
    const nonStarredSummary = visibleSummary.filter(
      (pod) => !pod.space.isStarred
    );

    const VISIBLE_PODS = 4;
    const hiddenSummary = nonStarredSummary.slice(VISIBLE_PODS);
    const hiddenOverflowCount = hiddenSummary.reduce(
      (sum, s) => sum + s.unreadConversations.length,
      0
    );
    const hiddenOverflowHasActivity = hiddenSummary.some(
      (s) =>
        s.unreadConversations.length > 0 ||
        s.nonParticipantUnreadConversationIds.length > 0
    );

    return (
      <NavigationList className="mx-sidebar-side-spacing flex-shrink-0">
        <NavigationListCollapsibleSection
          label="Pods"
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
                  variant="ghost-secondary"
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
    visibleSummary,
    setIsCreatePodModalOpen,
    isPodsSectionCollapsed,
    setPodsSectionCollapsed,
    isSummaryLoading,
    sidebarTitleFilter,
  ]);

  const navItemsSection = (showGetStarted ||
    (!isMultiSelect && !hideActions)) && (
    <NavigationList className="mx-sidebar-side-spacing pt-1">
      {showGetStarted && (
        <NavigationListItem
          label="For you"
          icon={Lightbulb04}
          href={getGetStartedRoute(owner.sId)}
          selected={router.asPath?.startsWith(getGetStartedRoute(owner.sId))}
          suffix={
            activationRecsForBadge.length > 0 ? (
              <Counter
                value={activationRecsForBadge.length}
                size="xs"
                variant="highlight"
              />
            ) : undefined
          }
        />
      )}
      {!isMultiSelect && !hideActions && (
        <>
          <NavigationListItem
            href={getAgentBuilderRoute(owner.sId, "manage")}
            icon={Robot}
            label="Agents"
            selected={router.asPath.startsWith(
              `/w/${owner.sId}/builder/agents`
            )}
            data-gtm-label="assistantManagementButton"
            data-gtm-location="sidebarMenu"
            onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_agents", () =>
              setSidebarOpen(false)
            )}
            keepHoverOnMoreMenu
            moreMenu={
              canCreateAgent ? (
                <div
                  className={cn(
                    "absolute right-2 top-1.5",
                    "transition-opacity",
                    "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
                    "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
                    "has-[[data-state=open]]:opacity-100"
                  )}
                >
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xs"
                        icon={Plus}
                        label="New"
                        variant="ghost-secondary"
                        className="data-[state=open]:bg-hover"
                        disabled={noHealthyProviders}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    </DropdownMenuTrigger>
                    <CreateAgentDropdownContent
                      owner={owner}
                      dataGtmLocation="sidebarMenu"
                      onNavigate={() => setSidebarOpen(false)}
                      side="bottom"
                      align="center"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </DropdownMenu>
                </div>
              ) : undefined
            }
          />
          <NavigationListItem
            href={getSkillBuilderRoute(owner.sId, "manage")}
            icon={SKILL_ICON}
            label="Skills"
            selected={router.asPath.startsWith(
              `/w/${owner.sId}/builder/skills`
            )}
            onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_skills", () =>
              setSidebarOpen(false)
            )}
            keepHoverOnMoreMenu
            moreMenu={
              canCreateSkill ? (
                <div
                  className={cn(
                    "absolute right-2 top-1.5",
                    "transition-opacity",
                    "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
                    "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
                    "has-[[data-state=open]]:opacity-100"
                  )}
                >
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xs"
                        icon={Plus}
                        label="New"
                        variant="ghost-secondary"
                        className="data-[state=open]:bg-hover"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="bottom"
                      align="center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuLabel label="New skill" />
                      <DropdownMenuItem
                        href={getSkillBuilderRoute(owner.sId, "new")}
                        icon={SKILL_ICON}
                        label="From scratch"
                        onClick={() => setSidebarOpen(false)}
                      />
                      <DropdownMenuItem
                        icon={FolderOpen}
                        label="From existing"
                        onClick={() => setIsImportSkillDialogOpen(true)}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : undefined
            }
          />
        </>
      )}
    </NavigationList>
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const conversationsList = useMemo(() => {
    return (
      <NavigationListWithInbox
        conversations={filteredConversations}
        pods={spaces}
        titleFilter={sidebarTitleFilter}
        isMultiSelect={isMultiSelect}
        selectedConversations={selectedConversations}
        toggleConversationSelection={toggleConversationSelection}
        activeConversationId={activeConversationId}
        owner={owner}
        topSection={navItemsSection}
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
    navItemsSection,
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
              <div className="z-50 flex justify-between gap-2 border-b border-border-dark/60 p-2 mb-4">
                <div className="flex gap-2">
                  <DropdownMenu
                    modal={false}
                    onOpenChange={(open) => {
                      if (!open) {
                        setPodSearchText("");
                      }
                    }}
                  >
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
                      dropdownHeaders={
                        <DropdownMenuSearchbar
                          name="pod-search"
                          placeholder="Search Pods"
                          value={podSearchText}
                          onChange={setPodSearchText}
                          autoFocus
                        />
                      }
                    >
                      <DropdownMenuItem
                        icon={Plus}
                        label="New Pod"
                        onClick={() => {
                          setPendingMoveToNewPod(true);
                          setIsCreatePodModalOpen(true);
                        }}
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel label="Pods" />
                      {availablePods.length > 0 ? (
                        availablePods.map((pod) => (
                          <DropdownMenuItem
                            key={pod.sId}
                            icon={getSpaceIcon(pod)}
                            label={pod.name}
                            truncateText
                            onClick={() => moveSelectionToPod(pod)}
                          />
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
                          {!!podSearchText ? "No matches" : "No Pods"}
                        </div>
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
              <div className="z-50 flex justify-end gap-2 p-sidebar-side-spacing">
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
                    variant="highlight"
                    className="shrink-0"
                    tooltip="Create a new conversation"
                    onClick={handleNewClick}
                  />
                </div>
              </div>
            )}
            {isSearchActive && navItemsSection}
            <div className="min-h-0 flex-1 overflow-hidden">
              {isConversationsError && (
                <Label className="px-3 py-4 text-xs font-medium text-muted-foreground">
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
            </div>

            {!hideInAppBanner && <StackedInAppBanners owner={owner} />}
          </div>
        </div>
      </div>
    </>
  );
}

interface UnreadConversationsSectionProps {
  label: string;
  conversations: ConversationListItemType[];
  pods: PodListItemType[];
  isMultiSelect: boolean;
  onMarkAllAsRead: (conversationIds: string[]) => Promise<void>;
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
  pods,
  isMultiSelect,
  titleFilter,
  onMarkAllAsRead,
  selectedConversations,
  toggleConversationSelection,
  activeConversationId,
  owner,
}: UnreadConversationsSectionProps) {
  const conversationGroups = useMemo(
    () => groupUnreadConversations(conversations, pods),
    [conversations, pods]
  );

  // Which mark-as-read button is in flight ("all" or a pod's spaceId), so
  // only the clicked button shows a spinner.
  const [markingScope, setMarkingScope] = useState<string | null>(null);

  const handleMarkAsRead = useCallback(
    async (scope: string, conversationIds: string[]) => {
      setMarkingScope(scope);
      try {
        await onMarkAllAsRead(conversationIds);
      } finally {
        // Only clear our own scope: another button may be in flight.
        setMarkingScope((prev) => (prev === scope ? null : prev));
      }
    },
    [onMarkAllAsRead]
  );

  const podById = useMemo(
    () => new Map(pods.map((pod) => [pod.sId, pod])),
    [pods]
  );

  const totalCount = conversations.length;

  const shouldShowMarkAllAsReadButton =
    totalCount > 0 && titleFilter.length === 0 && !isMultiSelect;

  return (
    <NavigationListCollapsibleSection
      label={label}
      count={totalCount}
      className="bg-background rounded-xl border border-border p-1 mx-sidebar-side-spacing"
      action={
        shouldShowMarkAllAsReadButton ? (
          <Button
            size="xmini"
            variant="ghost-secondary"
            label="Mark all as read"
            onClick={() =>
              void handleMarkAsRead(
                "all",
                conversations.map((c) => c.sId)
              )
            }
            isLoading={markingScope === "all"}
            hasLighterFont
            className="hover:bg-hover active:bg-selected"
          />
        ) : null
      }
      actionOnHover={false}
    >
      <AnimatePresence initial={false}>
        {conversationGroups.flatMap((group) => {
          switch (group.type) {
            case "non_pod":
              return group.conversations.map((conversation) => (
                <motion.div
                  key={conversation.sId}
                  style={GRID_STYLE}
                  animate={GRID_ANIMATE}
                  exit={GRID_EXIT}
                  transition={{ ease: "easeOut", duration: 0.1 }}
                >
                  <div className="overflow-hidden">
                    <ConversationListItem
                      conversation={conversation}
                      isMultiSelect={isMultiSelect}
                      selectedConversations={selectedConversations}
                      toggleConversationSelection={toggleConversationSelection}
                      activeConversationId={activeConversationId}
                      owner={owner}
                      showStatusDot={false}
                    />
                  </div>
                </motion.div>
              ));
            case "pod": {
              const pod = podById.get(group.spaceId);
              return [
                <motion.div
                  key={`pod-group-${group.spaceId}`}
                  style={GRID_STYLE}
                  animate={GRID_ANIMATE}
                  exit={GRID_EXIT}
                  transition={{ ease: "easeOut", duration: 0.1 }}
                >
                  {/* Hovering the pod's "Mark as read" button highlights the
                   * whole block (header + conversations) it would clear. */}
                  <div
                    className={cn(
                      "flex flex-col gap-0.5 overflow-hidden rounded-lg",
                      "transition-colors duration-150 motion-reduce:transition-none",
                      "has-[[data-mark-read=pod]:hover]:bg-hover",
                      "has-[[data-mark-read=pod]:focus-visible]:bg-hover"
                    )}
                  >
                    <NavigationListLabel
                      // Static group header: no text cursor, and bg-transparent
                      // lets the hover block show through. mt-2/pt-2 splits the
                      // label's pt-4 to keep half the spacing outside the block.
                      className="bg-transparent cursor-default select-none mt-2 pt-2"
                      label={group.podName}
                      icon={pod ? getSpaceIcon(pod) : undefined}
                      action={
                        shouldShowMarkAllAsReadButton ? (
                          <Button
                            size="xmini"
                            variant="ghost-secondary"
                            label="Mark as read"
                            data-mark-read="pod"
                            onClick={() =>
                              void handleMarkAsRead(
                                group.spaceId,
                                group.conversations.map((c) => c.sId)
                              )
                            }
                            isLoading={markingScope === group.spaceId}
                            hasLighterFont
                            className="hover:bg-hover active:bg-selected"
                          />
                        ) : null
                      }
                    />
                    <AnimatePresence initial={false}>
                      {group.conversations.map((conversation) => (
                        <motion.div
                          key={conversation.sId}
                          style={GRID_STYLE}
                          animate={GRID_ANIMATE}
                          exit={GRID_EXIT}
                          transition={{ ease: "easeOut", duration: 0.1 }}
                        >
                          {/* Indented under the pod header so the conversation
                           * reads as nested inside the pod group. */}
                          <div className="overflow-hidden pl-3">
                            <ConversationListItem
                              conversation={conversation}
                              isMultiSelect={isMultiSelect}
                              selectedConversations={selectedConversations}
                              toggleConversationSelection={
                                toggleConversationSelection
                              }
                              activeConversationId={activeConversationId}
                              owner={owner}
                              showStatusDot={false}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>,
              ];
            }
            default:
              assertNever(group);
          }
        })}
      </AnimatePresence>
    </NavigationListCollapsibleSection>
  );
}

const ConversationList = ({
  conversations,
  dateLabel,
  isFirstGroup,
  ...props
}: {
  conversations: ConversationListItemType[];
  dateLabel: string;
  isFirstGroup: boolean;
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
      {/* Compact overline so date groups read as a level below the
       * (semibold) section titles rather than competing with them. The top
       * padding separates a group from the one above it, so the first group
       * — which follows the section header — does without it. */}
      <NavigationListCompactLabel
        label={dateLabel}
        isSticky
        className={cn("bg-app-background", isFirstGroup && "pt-2")}
      />

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
    <span className="copy-xs flex items-center gap-1 text-muted-foreground">
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
    showStatusDot = true,
  }: {
    conversation: ConversationListItemType;
    isMultiSelect: boolean;
    selectedConversations: ConversationListItemType[];
    toggleConversationSelection: (c: ConversationListItemType) => void;
    activeConversationId: string | null;
    owner: WorkspaceType;
    showStatusDot?: boolean;
  }) => {
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
    const {
      isMenuOpen,
      isMenuOpenOrClosing,
      menuTriggerPosition,
      handleRightClick,
      handleRightPointerDown,
      handleMenuPhaseChange,
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
      <div className="flex items-center mx-2 py-2">
        <Checkbox
          id={`conversation-${conversation.sId}`}
          className="bg-background"
          checked={selectedConversations.includes(conversation)}
          onCheckedChange={() => toggleConversationSelection(conversation)}
        />
        <Label
          htmlFor={`conversation-${conversation.sId}`}
          className="copy-sm ml-2 text-muted-foreground"
        >
          {conversationLabel}
        </Label>
      </div>
    ) : (
      <NavigationListItem
        key={conversation.sId}
        selected={activeConversationId === conversation.sId}
        status={showStatusDot ? getConversationDotStatus(conversation) : "idle"}
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
            isOpenOrClosing={isMenuOpenOrClosing}
            onPhaseChange={handleMenuPhaseChange}
            triggerPosition={menuTriggerPosition}
          />
        }
        onPointerDownCapture={handleRightPointerDown}
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
  pods: PodListItemType[];
  titleFilter: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationListItemType[];
  toggleConversationSelection: (conversation: ConversationListItemType) => void;
  activeConversationId: string | null;
  owner: WorkspaceType;
  topSection?: React.ReactNode;
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
  pods,
  titleFilter,
  isMultiSelect,
  selectedConversations,
  toggleConversationSelection,
  activeConversationId,
  owner,
  topSection,
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
  // The Radix ScrollArea root never scrolls (overflow-hidden); the inner
  // viewport does. Keep it in state so InfiniteScroll re-binds once mounted.
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollTopSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = scrollTopSentinelRef.current;
    if (
      !scrollViewport ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { root: scrollViewport }
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [scrollViewport]);

  const { isConversationsSectionCollapsed, setConversationsSectionCollapsed } =
    useConversationsSectionCollapsed();
  const {
    readConversations,
    inboxConversations,
    skillSuggestionConversations,
    triggeredConversations,
  } = useMemo(() => {
    return getGroupConversationsByUnreadAndActionRequired(
      conversations,
      titleFilter,
      activeConversationId
    );
  }, [conversations, titleFilter, activeConversationId]);

  const { markAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate = readConversations?.length
    ? getGroupConversationsByDate({
        conversations: readConversations,
        titleFilter,
      })
    : ({} as Record<GroupLabel, ConversationListItemType[]>);

  // Empty groups render nothing, so the first non-empty one is the first the
  // user actually sees — that's the one that skips the top padding.
  const nonEmptyDateLabels = Object.keys(conversationsByDate).filter(
    (dateLabel) => conversationsByDate[dateLabel as GroupLabel].length > 0
  );

  const conversationsContent = (
    <>
      {nonEmptyDateLabels.map((dateLabel, index) => (
        <ConversationList
          key={dateLabel}
          conversations={conversationsByDate[dateLabel as GroupLabel]}
          dateLabel={dateLabel}
          isFirstGroup={index === 0}
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
        options={{ root: scrollViewport, rootMargin: "400px" }}
        loader={
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        }
      />
    </>
  );

  return (
    <ScrollArea
      viewportRef={setScrollViewport}
      className="dd-privacy-mask h-full w-full"
    >
      <div ref={scrollTopSentinelRef} className="h-px" aria-hidden />
      <div className="sticky top-0 z-30 h-0" aria-hidden>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-8 backdrop-blur-[4px]",
            "bg-app-background/100",
            "[mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]",
            "transition-opacity duration-200",
            isScrolled ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
      <div className="flex flex-col gap-4">
        {topSection}
        <AnimatePresence initial={false}>
          {triggeredConversations.length > 0 && (
            <motion.div
              key="triggered"
              style={GRID_STYLE}
              animate={GRID_ANIMATE}
              exit={GRID_EXIT}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="overflow-hidden">
                <UnreadConversationsSection
                  label="Auto"
                  conversations={triggeredConversations}
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
        <NavigationList className="mx-sidebar-side-spacing">
          <NavigationListCollapsibleSection
            label="Conversations"
            type="collapse"
            open={!isConversationsSectionCollapsed}
            onOpenChange={(open) => setConversationsSectionCollapsed(!open)}
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
                  <DropdownMenuContent
                    onFocusOutside={(e) => e.preventDefault()}
                  >
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
                        setHideTriggeredConversations(
                          !hideTriggeredConversations
                        )
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
    </ScrollArea>
  );
}
