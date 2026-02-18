import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { CreateProjectModal } from "@app/components/assistant/conversation/CreateProjectModal";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { StackedInAppBanners } from "@app/components/assistant/conversation/InAppBanner";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ProjectsBrowsePopover } from "@app/components/assistant/conversation/sidebar/ProjectsBrowsePopover";
import { ProjectsList } from "@app/components/assistant/conversation/sidebar/ProjectsList";
import { SidebarSearch } from "@app/components/assistant/conversation/sidebar/SidebarSearch";
import {
  filterTriggeredConversations,
  getGroupConversationsByDate,
  getGroupConversationsByUnreadAndActionRequired,
} from "@app/components/assistant/conversation/utils";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  useSearchPrivateConversations,
  useSearchProjectConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useDeleteConversation } from "@app/hooks/useDeleteConversation";
import { useHideTriggeredConversations } from "@app/hooks/useHideTriggeredConversations";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSendNotification } from "@app/hooks/useNotification";
import { useProjectsSectionCollapsed } from "@app/hooks/useProjectsSectionCollapsed";
import { useSearchProjects } from "@app/hooks/useSearchProjects";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { CONVERSATIONS_UPDATED_EVENT } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getProjectRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ProjectType, SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  Avatar,
  BoltIcon,
  BoltOffIcon,
  BracesIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  Checkbox,
  CheckDoubleIcon,
  cn,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Label,
  ListCheckIcon,
  MagicIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Spinner,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import moment from "moment";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface AgentSidebarMenuProps {
  owner: WorkspaceType;
}

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface SearchProjectItemProps {
  space: SpaceType;
  owner: WorkspaceType;
  isMember: boolean;
  activeSpaceId: string | null;
}

function SearchProjectItem({
  space,
  owner,
  isMember,
  activeSpaceId,
}: SearchProjectItemProps) {
  const router = useAppRouter();
  const { setSidebarOpen } = useContext(SidebarContext);

  return (
    <NavigationListItem
      selected={activeSpaceId === space.sId}
      icon={getSpaceIcon(space)}
      label={space.name}
      className={cn(!isMember && "italic")}
      onClick={async () => {
        setSidebarOpen(false);
        await router.push(getProjectRoute(owner.sId, space.sId));
      }}
    />
  );
}

interface SearchResultsProps {
  owner: WorkspaceType;
  allProjects: Array<ProjectType & { isMember: boolean }>;
  isSearchingProjects: boolean;
  hasMoreProjects: boolean;
  loadMoreProjects: () => void;
  isLoadingMoreProjects: boolean;
  projectConversationResults: Array<
    ConversationWithoutContentType & { spaceName: string }
  >;
  privateConversations: ConversationWithoutContentType[];
  isSearchingPrivateConversations: boolean;
  hasMorePrivateConversations: boolean;
  loadMorePrivateConversations: () => void;
  isLoadingMorePrivateConversations: boolean;
  isSearchingProjectConversations: boolean;
  onCreateProject: () => void;
  activeConversationId: string | null;
  activeSpaceId: string | null;
}

function SearchResults({
  owner,
  allProjects,
  isSearchingProjects,
  hasMoreProjects,
  loadMoreProjects,
  isLoadingMoreProjects,
  projectConversationResults,
  privateConversations,
  isSearchingPrivateConversations,
  hasMorePrivateConversations,
  loadMorePrivateConversations,
  isLoadingMorePrivateConversations,
  isSearchingProjectConversations,
  onCreateProject,
  activeConversationId,
  activeSpaceId,
}: SearchResultsProps) {
  const [projectsSectionOpen, setProjectsSectionOpen] = useState(true);

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
    for (const conv of projectConversationResults) {
      if (!seen.has(conv.sId)) {
        seen.add(conv.sId);
        merged.push(conv);
      }
    }

    return merged;
  }, [privateConversations, projectConversationResults]);

  const handleShowMoreProjects = useCallback(() => {
    loadMoreProjects();
  }, [loadMoreProjects]);

  const handleShowMorePrivateConversations = useCallback(() => {
    loadMorePrivateConversations();
  }, [loadMorePrivateConversations]);

  const showProjectsLoading = isSearchingProjects && !isLoadingMoreProjects;
  const showConversationsLoading =
    (isSearchingPrivateConversations && !isLoadingMorePrivateConversations) ||
    isSearchingProjectConversations;

  return (
    <div className="h-full overflow-y-auto">
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label="Projects"
          type="collapse"
          open={projectsSectionOpen}
          onOpenChange={setProjectsSectionOpen}
          action={
            <>
              <Button
                size="xs"
                icon={PlusIcon}
                label="New"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCreateProject();
                }}
              />
              <ProjectsBrowsePopover owner={owner} />
            </>
          }
        >
          {showProjectsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : allProjects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <>
              {allProjects.map((project) => (
                <SearchProjectItem
                  key={project.sId}
                  space={project}
                  owner={owner}
                  isMember={project.isMember}
                  activeSpaceId={activeSpaceId}
                />
              ))}
              {hasMoreProjects && (
                <div className="flex justify-center py-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    label={isLoadingMoreProjects ? "Loading..." : "Show more"}
                    onClick={handleShowMoreProjects}
                    disabled={isLoadingMoreProjects}
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
            <Button
              size="xmini"
              icon={ChatBubbleLeftRightIcon}
              variant="ghost"
              tooltip="New Conversation"
              href={getConversationRoute(owner.sId)}
            />
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
                isMultiSelect={false}
                selectedConversations={[]}
                toggleConversationSelection={() => {}}
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

export function AgentSidebarMenu({ owner }: AgentSidebarMenuProps) {
  const router = useAppRouter();
  const activeConversationId = useActiveConversationId();
  const activeSpaceId = useActiveSpaceId();
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const agentsSearchInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const hasSpaceConversations = hasFeature("projects");

  const {
    summary,
    isLoading: isSummaryLoading,
    mutate: mutateSpaceSummary,
  } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: !hasSpaceConversations },
  });

  useEffect(() => {
    const handleConversationsUpdated = () => {
      void mutateConversations();
      if (hasSpaceConversations) {
        void mutateSpaceSummary();
      }
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
  }, [hasSpaceConversations, mutateConversations, mutateSpaceSummary]);

  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    ConversationWithoutContentType[]
  >([]);
  const doDelete = useDeleteConversation(owner);

  const { hideTriggeredConversations } = useHideTriggeredConversations();

  const { isProjectsSectionCollapsed, setProjectsSectionCollapsed } =
    useProjectsSectionCollapsed();

  const isRestrictedFromAgentCreation =
    hasFeature("disallow_agent_creation_to_users") && !isBuilder(owner);

  const [showDeleteDialog, setShowDeleteDialog] = useState<
    "all" | "selection" | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string>("");
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);

  const {
    projects: allProjects,
    isSearching: isSearchingProjects,
    hasMore: hasMoreProjects,
    loadMore: loadMoreProjects,
    isLoadingMore: isLoadingMoreProjects,
  } = useSearchProjects({
    workspaceId: owner.sId,
    query: titleFilter,
    enabled: hasSpaceConversations && titleFilter.trim().length > 0,
  });

  const {
    conversations: projectConversationSearchResults,
    isSearching: isSearchingProjectConversations,
  } = useSearchProjectConversations({
    workspaceId: owner.sId,
    query: titleFilter,
    enabled: hasSpaceConversations && titleFilter.trim().length > 0,
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
    enabled: hasSpaceConversations && titleFilter.trim().length > 0,
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
    (c: ConversationWithoutContentType) => {
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
      conversations.some(
        (c: ConversationWithoutContentType) => c.triggerId !== null
      ),
    [conversations]
  );

  const filteredConversations = useMemo(() => {
    return filterTriggeredConversations(
      conversations,
      hideTriggeredConversations
    );
  }, [conversations, hideTriggeredConversations]);

  const isSearchActive = hasSpaceConversations && titleFilter.trim().length > 0;

  const sidebarTitleFilter = hasSpaceConversations ? "" : titleFilter;

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const projectsSection = useMemo(() => {
    if (!hasSpaceConversations) {
      return null;
    }
    const projectCountInSummary = summary.length;
    const showCount = isProjectsSectionCollapsed && projectCountInSummary > 0;

    return (
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label={showCount ? `Projects (${projectCountInSummary})` : "Projects"}
          type="collapse"
          open={!isProjectsSectionCollapsed}
          onOpenChange={(open) => setProjectsSectionCollapsed(!open)}
          action={
            summary.length > 0 ? (
              <>
                <Button
                  size="xs"
                  icon={PlusIcon}
                  label="New"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCreateProjectModalOpen(true);
                  }}
                />
                <ProjectsBrowsePopover owner={owner} />
              </>
            ) : null
          }
        >
          {isSummaryLoading ? (
            <div className="flex items-center justify-center">
              <Spinner size="xs" />
            </div>
          ) : summary.length > 0 ? (
            <ProjectsList
              owner={owner}
              summary={summary}
              titleFilter={sidebarTitleFilter}
            />
          ) : (
            <NavigationListItem
              label="Create a Project"
              icon={PlusIcon}
              onClick={() => setIsCreateProjectModalOpen(true)}
            />
          )}
        </NavigationListCollapsibleSection>
      </NavigationList>
    );
  }, [
    hasSpaceConversations,
    owner,
    summary,
    setIsCreateProjectModalOpen,
    isProjectsSectionCollapsed,
    setProjectsSectionCollapsed,
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
        projectsSection={projectsSection}
        hasTriggeredConversations={hasTriggeredConversations}
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
    projectsSection,
    hasTriggeredConversations,
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
      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
        owner={owner}
      />
      <div className="relative flex grow flex-col">
        <div className="flex h-0 min-h-full w-full">
          <div className="flex w-full flex-col">
            {isMultiSelect ? (
              <div className="z-50 flex justify-between gap-2 border-b border-border-dark/60 p-2 dark:border-border-dark/60">
                <Button
                  variant={
                    selectedConversations.length === 0 ? "outline" : "warning"
                  }
                  label="Delete"
                  disabled={selectedConversations.length === 0}
                  onClick={() => setShowDeleteDialog("selection")}
                />
                <Button
                  variant="ghost"
                  icon={XMarkIcon}
                  onClick={toggleMultiSelect}
                />
              </div>
            ) : (
              <div className="z-50 flex justify-end gap-2 p-2">
                {hasSpaceConversations ? (
                  <div className="flex-1">
                    <SidebarSearch
                      titleFilter={titleFilter}
                      onTitleFilterChange={setTitleFilter}
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <SearchInput
                      ref={searchInputRef}
                      name="search"
                      placeholder="Search"
                      value={titleFilter}
                      onChange={setTitleFilter}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    label="New"
                    href={getConversationRoute(owner.sId)}
                    icon={ChatBubbleBottomCenterTextIcon}
                    className="shrink-0"
                    tooltip="Create a new conversation"
                    onClick={handleNewClick}
                  />
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" icon={MoreIcon} variant="outline" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {!isRestrictedFromAgentCreation && (
                        <>
                          <DropdownMenuLabel>Agents</DropdownMenuLabel>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                              icon={PlusIcon}
                              label="New agent"
                            />
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="pointer-events-auto">
                                <DropdownMenuItem
                                  href={getAgentBuilderRoute(owner.sId, "new")}
                                  icon={DocumentIcon}
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
                                  icon={MagicIcon}
                                  label="From template"
                                  data-gtm-label="assistantCreationButton"
                                  data-gtm-location="sidebarMenu"
                                  onClick={withTracking(
                                    TRACKING_AREAS.BUILDER,
                                    "create_from_template"
                                  )}
                                />
                                {hasFeature("agent_to_yaml") && (
                                  <DropdownMenuItem
                                    icon={
                                      isUploadingYAML ? (
                                        <Spinner size="xs" />
                                      ) : (
                                        BracesIcon
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
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          {editableAgents.length > 0 && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger
                                icon={PencilSquareIcon}
                                label="Edit agent"
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
                            icon={RobotIcon}
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
                          <DropdownMenuItem
                            href={getSkillBuilderRoute(owner.sId, "new")}
                            icon={PlusIcon}
                            label="New skill"
                          />
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
                        icon={ListCheckIcon}
                        disabled={filteredConversations.length === 0}
                      />
                      <DropdownMenuItem
                        label="Clear conversation history"
                        onClick={() => setShowDeleteDialog("all")}
                        icon={TrashIcon}
                        disabled={filteredConversations.length === 0}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                allProjects={allProjects}
                isSearchingProjects={isSearchingProjects}
                hasMoreProjects={hasMoreProjects}
                loadMoreProjects={loadMoreProjects}
                isLoadingMoreProjects={isLoadingMoreProjects}
                projectConversationResults={projectConversationSearchResults}
                privateConversations={privateConversationSearchResults}
                isSearchingPrivateConversations={
                  isSearchingPrivateConversations
                }
                hasMorePrivateConversations={hasMorePrivateConversations}
                loadMorePrivateConversations={loadMorePrivateConversations}
                isLoadingMorePrivateConversations={
                  isLoadingMorePrivateConversations
                }
                isSearchingProjectConversations={
                  isSearchingProjectConversations
                }
                onCreateProject={() => setIsCreateProjectModalOpen(true)}
                activeConversationId={activeConversationId}
                activeSpaceId={activeSpaceId}
              />
            ) : (
              conversationsList
            )}

            <StackedInAppBanners owner={owner} />
          </div>
        </div>
      </div>
    </>
  );
}

interface InboxConversationListProps {
  inboxConversations: ConversationWithoutContentType[];
  dateLabel: string;
  isMultiSelect: boolean;
  isMarkingAllAsRead: boolean;
  onMarkAllAsRead: (conversations: ConversationWithoutContentType[]) => void;
  selectedConversations: ConversationWithoutContentType[];
  toggleConversationSelection: (c: ConversationWithoutContentType) => void;
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

const InboxConversationList = ({
  inboxConversations,
  dateLabel,
  isMultiSelect,
  isMarkingAllAsRead,
  titleFilter,
  onMarkAllAsRead,
  ...props
}: InboxConversationListProps) => {
  if (inboxConversations.length === 0) {
    return null;
  }

  const shouldShowMarkAllAsReadButton =
    inboxConversations.length > 0 &&
    titleFilter.length === 0 &&
    !isMultiSelect &&
    onMarkAllAsRead;

  return (
    <NavigationListCollapsibleSection
      label={dateLabel}
      className="border-b border-t border-border bg-background/50 px-2 pb-2 dark:border-border-night dark:bg-background-night/50"
      defaultOpen
      actionOnHover={false}
      action={
        shouldShowMarkAllAsReadButton ? (
          <Button
            size="xmini"
            variant="ghost"
            icon={CheckDoubleIcon}
            tooltip="Mark all as read"
            onClick={() => onMarkAllAsRead(inboxConversations)}
            isLoading={isMarkingAllAsRead}
          />
        ) : null
      }
    >
      {inboxConversations.map((conversation) => (
        <ConversationListItem
          key={conversation.sId}
          conversation={conversation}
          isMultiSelect={isMultiSelect}
          {...props}
        />
      ))}
    </NavigationListCollapsibleSection>
  );
};

const ConversationList = ({
  conversations,
  dateLabel,
  ...props
}: {
  conversations: ConversationWithoutContentType[];
  dateLabel: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationWithoutContentType[];
  toggleConversationSelection: (c: ConversationWithoutContentType) => void;
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

function getConversationDotStatus(
  conversation: ConversationWithoutContentType
): "blocked" | "unread" | "idle" {
  if (conversation.actionRequired) {
    return "blocked";
  }
  if (conversation.hasError) {
    return conversation.unread ? "blocked" : "idle";
  }
  if (conversation.unread) {
    return "unread";
  }
  return "idle";
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
    conversation: ConversationWithoutContentType;
    isMultiSelect: boolean;
    selectedConversations: ConversationWithoutContentType[];
    toggleConversationSelection: (c: ConversationWithoutContentType) => void;
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

    const conversationLabel =
      conversation.title ??
      (moment(conversation.created).isSame(moment(), "day")
        ? "New Conversation"
        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        // Only allow dragging if not in multi-select mode and conversation is not already in a project
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
        selected={activeConversationId === conversation.sId}
        status={getConversationDotStatus(conversation)}
        label={conversationLabel}
        href={getConversationRoute(owner.sId, conversation.sId)}
        shallow
        draggable={!conversation.spaceId}
        onDragStart={handleDragStart}
        className={
          !conversation.spaceId
            ? "cursor-grab active:cursor-grabbing"
            : undefined
        }
        moreMenu={
          <ConversationMenu
            activeConversationId={conversation.sId}
            conversation={conversation}
            owner={owner}
            trigger={<NavigationListItemAction />}
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
  conversations: ConversationWithoutContentType[];
  titleFilter: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationWithoutContentType[];
  toggleConversationSelection: (
    conversation: ConversationWithoutContentType
  ) => void;
  activeConversationId: string | null;
  owner: WorkspaceType;
  projectsSection?: React.ReactNode;
  hasTriggeredConversations: boolean;
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
  projectsSection,
  hasTriggeredConversations,
  handleNewClick,
  toggleMultiSelect,
  setShowDeleteDialog,
  hasMore,
  loadMore,
  isLoadingMore,
}: NavigationListWithInboxProps) {
  const { hideTriggeredConversations, setHideTriggeredConversations } =
    useHideTriggeredConversations();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { readConversations, inboxConversations } = useMemo(() => {
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
    : ({} as Record<GroupLabel, ConversationWithoutContentType[]>);

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
      {inboxConversations.length > 0 && (
        <InboxConversationList
          inboxConversations={inboxConversations}
          dateLabel={`Inbox (${inboxConversations.length})`}
          isMultiSelect={isMultiSelect}
          isMarkingAllAsRead={isMarkingAllAsRead}
          titleFilter={titleFilter}
          onMarkAllAsRead={markAllAsRead}
          selectedConversations={selectedConversations}
          toggleConversationSelection={toggleConversationSelection}
          activeConversationId={activeConversationId}
          owner={owner}
        />
      )}
      {projectsSection}
      <NavigationList className="px-2">
        <NavigationListCollapsibleSection
          label="Conversations"
          defaultOpen
          action={
            <>
              <Button
                size="xmini"
                icon={ChatBubbleLeftRightIcon}
                variant="ghost"
                aria-label="New Conversation"
                tooltip="New Conversation"
                href={getConversationRoute(owner.sId)}
                onClick={handleNewClick}
              />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xmini"
                    icon={MoreIcon}
                    variant="ghost"
                    aria-label="Conversations options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label={
                      hideTriggeredConversations
                        ? "Show triggered"
                        : "Hide triggered"
                    }
                    icon={hideTriggeredConversations ? BoltIcon : BoltOffIcon}
                    disabled={!hasTriggeredConversations}
                    onClick={() =>
                      setHideTriggeredConversations(!hideTriggeredConversations)
                    }
                  />
                  <DropdownMenuItem
                    label="Edit history"
                    icon={ListCheckIcon}
                    onClick={toggleMultiSelect}
                    disabled={conversations.length === 0}
                  />
                  <DropdownMenuItem
                    label="Clear history"
                    variant="warning"
                    icon={TrashIcon}
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
