import { useIsAgentLoopStreaming } from "@app/components/assistant/conversation/AgentLoopStreamContext";
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
import { UnifiedSearchNav } from "@app/components/assistant/conversation/sidebar/UnifiedSearchNav";
import {
  filterReadTriggeredConversations,
  getGroupConversationsByDate,
  getGroupConversationsByUnreadAndActionRequired,
  groupUnreadConversations,
} from "@app/components/assistant/conversation/utils";
import { CreateAgentDropdownContent } from "@app/components/assistant/CreateAgentDropdown";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  usePodConversationsSummary,
} from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
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
import { useStarredPodsSectionCollapsed } from "@app/hooks/useStarredPodsSectionCollapsed";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { CONVERSATIONS_UPDATED_EVENT } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { getCreateFromConversationRoute } from "@app/lib/skills/conversational_building";
import { getSpaceIcon } from "@app/lib/spaces";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { RelativeDateBucket } from "@app/lib/utils/timestamps";
import { formatWakeUpSidebarLabel } from "@app/lib/utils/wakeup_description";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { PodListItemType, PodType, SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  ArrowRight,
  Button,
  Checkbox,
  CheckDone01,
  Clock,
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
  MessageChatCircle,
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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

const RELATIVE_DATE_BUCKET_LABELS: Record<
  RelativeDateBucket,
  MessageDescriptor
> = {
  Today: msg`Today`,
  Yesterday: msg`Yesterday`,
  "Last Week": msg`Last week`,
  "Last Month": msg`Last month`,
  "Last 12 Months": msg`Last 12 months`,
  Older: msg`Older`,
};

interface AgentSidebarMenuProps {
  owner: WorkspaceType;
  hideActions?: boolean;
  hideInAppBanner?: boolean;
}

export function AgentSidebarMenu({
  owner,
  hideActions,
  hideInAppBanner,
}: AgentSidebarMenuProps) {
  const { t } = useLingui();
  const router = useAppRouter();
  const activeConversationId = useActiveConversationId();
  const { hasPermission } = useWorkspacePermissions();
  const moveConversationToPod = useMoveConversationToPod(owner);
  const bulkMoveConversationsToPod = useBulkMoveConversationsToPod(owner);

  const { providersHealth } = useAuth();
  const noHealthyProviders = !hasHealthyProviders(providersHealth);

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
  const [isCreatePodModalOpen, setIsCreatePodModalOpen] = useState(false);
  const [pendingMoveToNewPod, setPendingMoveToNewPod] = useState(false);
  const [isImportSkillDialogOpen, setIsImportSkillDialogOpen] = useState(false);

  const sendNotification = useSendNotification();

  const toggleMultiSelect = useCallback(() => {
    setIsMultiSelect((prev) => !prev);
    setSelectedConversations([]);
  }, [setIsMultiSelect, setSelectedConversations]);

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
        title: t`Conversations successfully deleted`,
        description: t`${plural(total, {
          one: "# conversation has been deleted.",
          other: "# conversations have been deleted.",
        })}`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: t`Failed to delete conversations`,
        description: t`${plural(total, {
          one: "Could not delete the selected conversation.",
          other: "Could not delete the selected conversations.",
        })}`,
      });
    } else {
      sendNotification({
        type: "error",
        title: t`Some conversations couldn’t be deleted`,
        description: t`Deleted ${successCount} of ${total} conversations.`,
      });
    }
  }, [doDelete, selectedConversations, sendNotification, toggleMultiSelect, t]);

  const availablePods = useMemo(
    () =>
      summary
        .map(({ space }) => space)
        .filter((space) =>
          space.name.toLowerCase().includes(podSearchText.toLowerCase().trim())
        ),
    [summary, podSearchText]
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
        title: t`Conversations successfully deleted`,
        description: t`${plural(total, {
          one: "# conversation has been deleted.",
          other: "# conversations have been deleted.",
        })}`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: t`Failed to delete conversations`,
        description: t`Could not delete conversation history.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: t`Some conversations couldn’t be deleted`,
        description: t`Deleted ${successCount} of ${total} conversations.`,
      });
    }
    setIsDeleting(false);
    setShowDeleteDialog(null);
  }, [conversations, doDelete, sendNotification, t]);

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

  const starredSection = useMemo(() => {
    const starredSummary = summary.filter(({ space }) => space.isStarred);
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
          label={t`Starred`}
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
            moveConversationToPod: moveConversationToPod,
          })}
        </NavigationListCollapsibleSection>
      </NavigationList>
    );
  }, [
    summary,
    owner,
    moveConversationToPod,
    isStarredPodsSectionCollapsed,
    setStarredPodsSectionCollapsed,
    t,
  ]);

  const podsSection = useMemo(() => {
    const nonStarredSummary = summary.filter((pod) => !pod.space.isStarred);

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
          label={t`Pods`}
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
                  label={t({ message: "New", context: "button label" })}
                  variant="ghost-secondary"
                  onClick={withTracking(
                    TRACKING_AREAS.NAVIGATION,
                    "new_pod",
                    (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsCreatePodModalOpen(true);
                    },
                    { location: "pods_section" }
                  )}
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
              moveConversationToPod: moveConversationToPod,
            })
          ) : (
            <NavigationListItem
              label={t`Create a Pod`}
              icon={Plus}
              onClick={withTracking(
                TRACKING_AREAS.NAVIGATION,
                "new_pod",
                () => setIsCreatePodModalOpen(true),
                { location: "pods_empty_state" }
              )}
            />
          )}
        </NavigationListCollapsibleSection>
      </NavigationList>
    );
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
  }, [
    owner,
    summary,
    setIsCreatePodModalOpen,
    isPodsSectionCollapsed,
    setPodsSectionCollapsed,
    isSummaryLoading,
    t,
  ]);

  const navItemsSection = !isMultiSelect && !hideActions && (
    <NavigationList className="mx-sidebar-side-spacing pt-1">
      <NavigationListItem
        href={getAgentBuilderRoute(owner.sId, "manage")}
        icon={Robot}
        label={t`Agents`}
        selected={router.asPath.startsWith(`/w/${owner.sId}/builder/agents`)}
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
                    label={t({ message: "New", context: "button label" })}
                    variant="ghost-secondary"
                    className="data-[state=open]:bg-hover"
                    disabled={noHealthyProviders}
                    onClick={withTracking(
                      TRACKING_AREAS.NAVIGATION,
                      "new_agent",
                      (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    )}
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
        label={t`Skills`}
        selected={router.asPath.startsWith(`/w/${owner.sId}/builder/skills`)}
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
                    label={t({ message: "New", context: "button label" })}
                    variant="ghost-secondary"
                    className="data-[state=open]:bg-hover"
                    onClick={withTracking(
                      TRACKING_AREAS.NAVIGATION,
                      "new_skill",
                      (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    )}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuLabel label={t`New skill`} />
                  <DropdownMenuItem
                    href={getCreateFromConversationRoute(owner.sId, "skill")}
                    icon={MessageChatCircle}
                    label={t`From conversation`}
                    onClick={withTracking(
                      TRACKING_AREAS.BUILDER,
                      "create_skill_from_conversation",
                      () => setSidebarOpen(false)
                    )}
                  />
                  <DropdownMenuItem
                    href={getSkillBuilderRoute(owner.sId, "new")}
                    icon={SKILL_ICON}
                    label={t`From scratch`}
                    onClick={withTracking(
                      TRACKING_AREAS.BUILDER,
                      "create_skill",
                      () => setSidebarOpen(false)
                    )}
                  />
                  <DropdownMenuItem
                    icon={FolderOpen}
                    label={t`From existing`}
                    onClick={withTracking(
                      TRACKING_AREAS.BUILDER,
                      "import_skill",
                      () => setIsImportSkillDialogOpen(true)
                    )}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : undefined
        }
      />
    </NavigationList>
  );

  const conversationsList = useMemo(() => {
    return (
      <NavigationListWithInbox
        conversations={filteredConversations}
        pods={spaces}
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
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
  }, [
    filteredConversations,
    isMultiSelect,
    selectedConversations,
    toggleConversationSelection,
    activeConversationId,
    owner,
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
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
                <div className="flex flex-wrap gap-2">
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
                        label={t`Move to Pod`}
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
                          placeholder={t`Search Pods`}
                          value={podSearchText}
                          onChange={setPodSearchText}
                          autoFocus
                        />
                      }
                    >
                      <DropdownMenuItem
                        icon={Plus}
                        label={t`New Pod`}
                        onClick={withTracking(
                          TRACKING_AREAS.NAVIGATION,
                          "new_pod",
                          () => {
                            setPendingMoveToNewPod(true);
                            setIsCreatePodModalOpen(true);
                          },
                          { location: "move_conversations" }
                        )}
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel label={t`Pods`} />
                      {availablePods.length > 0 ? (
                        availablePods.map((pod) => (
                          <DropdownMenuItem
                            key={pod.sId}
                            icon={getSpaceIcon(pod)}
                            label={pod.name}
                            truncateText
                            tooltip={pod.name}
                            onClick={() => moveSelectionToPod(pod)}
                          />
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
                          {!!podSearchText ? t`No matches` : t`No Pods`}
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant={
                      selectedConversations.length === 0 ? "outline" : "warning"
                    }
                    label={t`Delete`}
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
              <UnifiedSearchNav
                owner={owner}
                onNewConversationClick={handleNewClick}
              />
            )}
            <div className="min-h-0 flex-1 overflow-hidden">
              {isConversationsError && (
                <Label className="px-3 py-4 text-xs font-medium text-muted-foreground">
                  <Trans>Error loading conversations</Trans>
                </Label>
              )}
              {conversationsList}
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
  onMarkAllAsRead,
  selectedConversations,
  toggleConversationSelection,
  activeConversationId,
  owner,
}: UnreadConversationsSectionProps) {
  const { t } = useLingui();
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

  const shouldShowMarkAllAsReadButton = totalCount > 0 && !isMultiSelect;

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
            label={t`Mark all as read`}
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
                            label={t`Mark as read`}
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
      {formatWakeUpSidebarLabel(nextWakeupAt, getActiveLocale())}
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
    const isAgentLoopStreaming = useIsAgentLoopStreaming(conversation.sId);
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
            : isAgentLoopStreaming
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
            await setTimeoutAsync(600);
          }
        }}
      />
    );
  }
);

interface NavigationListWithInboxProps {
  conversations: ConversationListItemType[];
  pods: PodListItemType[];
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
  const { t } = useLingui();
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
      activeConversationId
    );
  }, [conversations, activeConversationId]);

  const { markAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate = readConversations?.length
    ? getGroupConversationsByDate({
        conversations: readConversations,
      })
    : ({} as Record<RelativeDateBucket, ConversationListItemType[]>);

  // Empty groups render nothing, so the first non-empty one is the first the
  // user actually sees — that's the one that skips the top padding.
  const nonEmptyDateLabels = Object.keys(conversationsByDate).filter(
    (dateLabel) =>
      conversationsByDate[dateLabel as RelativeDateBucket].length > 0
  );

  const conversationsContent = (
    <>
      {nonEmptyDateLabels.map((dateLabel, index) => (
        <ConversationList
          key={dateLabel}
          conversations={conversationsByDate[dateLabel as RelativeDateBucket]}
          dateLabel={t(
            RELATIVE_DATE_BUCKET_LABELS[dateLabel as RelativeDateBucket]
          )}
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
                  label={t({
                    message: "Auto",
                    context: "sidebar section of triggered conversations",
                  })}
                  conversations={triggeredConversations}
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
                  label={t`Skill suggestions`}
                  conversations={skillSuggestionConversations}
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
                  label={t`Inbox`}
                  conversations={inboxConversations}
                  pods={pods}
                  isMultiSelect={isMultiSelect}
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
            label={t`Conversations`}
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
                      aria-label={t`Conversations options`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    onFocusOutside={(e) => e.preventDefault()}
                  >
                    <DropdownMenuLabel label={t`Conversations`} />
                    <DropdownMenuItem
                      label={
                        hideTriggeredConversations
                          ? t`Show triggered`
                          : t`Hide triggered`
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
                      label={t`Edit history`}
                      icon={CheckDone01}
                      onClick={toggleMultiSelect}
                      disabled={conversations.length === 0}
                    />
                    <DropdownMenuItem
                      label={t`Clear history`}
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
