import {
  AssistantCard,
  AssistantCardMore,
  Avatar,
  Button,
  CardGrid,
  Chip,
  ContactsRobotIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  MoreIcon,
  ScrollArea,
  ScrollBar,
  SearchDropdownMenu,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";

import { CreateAgentButton } from "@app/components/assistant/CreateAgentButton";
import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { AssistantDetails } from "@app/components/assistant/details/AssistantDetails";
import { AssistantDetailsDropdownMenu } from "@app/components/assistant/details/AssistantDetailsButtonBar";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { usePersistedAgentBrowserSelection } from "@app/hooks/usePersistedAgentBrowserSelection";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import { getAgentBuilderRoute, setQueryParam } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

const AGENTS_TABS = [
  { label: "Favorites", id: "favorites" },
  { label: "All agents", id: "all" },
  { label: "Editable by me", id: "editable_by_me" },
] as const;

type TabId = (typeof AGENTS_TABS)[number]["id"];

const MOST_POPULAR_TAG: TagType = {
  sId: "--most_popular--",
  name: "Most popular",
  kind: "protected",
};

const OTHERS_TAG: TagType = {
  sId: "--others--",
  name: "Others",
  kind: "protected",
};

type AgentGridProps = {
  agentConfigurations: LightAgentConfigurationType[];
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
  handleMoreClick: (agentId: string) => void;
  owner: WorkspaceType;
};

export const AgentGrid = ({
  agentConfigurations,
  handleAssistantClick,
  handleMoreClick,
  owner,
}: AgentGridProps) => {
  // Context menu state
  const [contextMenuAgent, setContextMenuAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<LightAgentConfigurationType | null>(null);

  // Handle "infinite" scroll
  // We only start with 9 items shown (no need more on mobile) and load more until we fill the parent container.
  // We use an intersection observer to detect when the bottom of the list is visible and load more items.
  // That way, the list starts lightweight and only show more items when needed.
  const ITEMS_PER_PAGE = 9; // Should be a multiple of 3

  const [itemsPage, setItemsPage] = useState(0);

  const nextPage = useCallback(() => {
    setItemsPage(itemsPage + 1);
  }, [setItemsPage, itemsPage]);

  const previousEntry = useRef<IntersectionObserverEntry | undefined>(
    undefined
  );

  const { ref, inView, entry } = useInView({
    threshold: 0,
  });

  useEffect(() => {
    if (
      // The observer is in view.
      inView &&
      // We have more items to show.
      agentConfigurations.length > itemsPage * ITEMS_PER_PAGE &&
      // The entry is different from the previous one to avoid multiple calls for the same intersection.
      entry != previousEntry.current
    ) {
      previousEntry.current = entry;
      nextPage();
    }
  }, [inView, nextPage, entry, agentConfigurations.length, itemsPage]);
  const slicedAgentConfigurations = agentConfigurations.slice(
    0,
    (itemsPage + 1) * ITEMS_PER_PAGE
  );
  return (
    <>
      <CardGrid>
        {slicedAgentConfigurations.map((agent, index) => {
          const isLastItem = index === slicedAgentConfigurations.length - 1;
          return (
            <AssistantCard
              // Force a re-render of the last item to trigger the intersection observer
              key={isLastItem ? `${agent.sId}-${itemsPage}` : agent.sId}
              ref={isLastItem ? ref : undefined}
              title={agent.name}
              pictureUrl={agent.pictureUrl}
              subtitle={agent.lastAuthors?.join(", ") ?? ""}
              description={agent.description}
              onClick={() => handleAssistantClick(agent)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuAgent(agent);
                setContextMenuPosition({ x: e.clientX, y: e.clientY });
              }}
              action={
                <AssistantCardMore
                  onClick={(e: Event) => {
                    e.stopPropagation();
                    handleMoreClick(agent.sId);
                  }}
                />
              }
            />
          );
        })}
      </CardGrid>
      {contextMenuAgent && contextMenuPosition && (
        <DropdownMenu
          open={!!contextMenuAgent}
          onOpenChange={(open) => {
            if (!open) {
              setContextMenuAgent(null);
              setContextMenuPosition(null);
            }
          }}
          modal
        >
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="start"
              className="s-whitespace-nowrap"
              style={{
                position: "fixed",
                left: contextMenuPosition.x,
                top: contextMenuPosition.y,
              }}
            >
              <AssistantDetailsDropdownMenu
                agentConfiguration={contextMenuAgent}
                owner={owner}
                onClose={() => {
                  setContextMenuAgent(null);
                  setContextMenuPosition(null);
                }}
                showEditOption={true}
                onDeleteClick={() => {
                  setAgentToDelete(contextMenuAgent);
                  setShowDeletionModal(true);
                  setContextMenuAgent(null);
                  setContextMenuPosition(null);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
      {agentToDelete && (
        <DeleteAssistantDialog
          owner={owner}
          isOpen={showDeletionModal}
          agentConfiguration={agentToDelete}
          onClose={() => {
            setShowDeletionModal(false);
            setAgentToDelete(null);
          }}
        />
      )}
    </>
  );
};

interface AssistantBrowserProps {
  owner: WorkspaceType;
  agentConfigurations: LightAgentConfigurationType[];
  isLoading: boolean;
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
  user: UserType;
}

export function AssistantBrowser({
  owner,
  agentConfigurations,
  isLoading,
  handleAssistantClick,
  user,
}: AssistantBrowserProps) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [selectedTab, setSelectedTab] = useHashParam(
    "selectedTab",
    "favorites"
  );
  const [displayedAssistantId, setDisplayedAssistantId] = useState<
    string | null
  >(null);

  const router = useRouter();
  const { createAgentButtonRef } = useWelcomeTourGuide();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { isDark } = useTheme();
  const [sortType, setSortType] = useState<
    "popularity" | "alphabetical" | "updated"
  >("popularity");

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const {
    selectedTagIds: persistedSelectedTagIds,
    setSelectedTagIds,
    isLoading: isPersistedSelectionLoading,
  } = usePersistedAgentBrowserSelection(owner.sId);

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  const sortAgents = useCallback(
    (a: LightAgentConfigurationType, b: LightAgentConfigurationType) => {
      if (sortType === "popularity") {
        return (
          (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0) ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
      if (sortType === "updated") {
        return (
          new Date(b.versionCreatedAt ?? 0).getTime() -
            new Date(a.versionCreatedAt ?? 0).getTime() ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    },
    [sortType]
  );

  const agentsByTab = useMemo(() => {
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => a.status === "active")
      .sort(sortAgents);

    return {
      // do not show the "all" tab while still loading all agents
      all: allAgents,
      favorites: allAgents.filter((a) => a.userFavorite),
      editable_by_me: allAgents.filter((a) => a.canEdit),
      most_popular: allAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
        )
        .slice(0, 6)
        .sort(sortAgents),
    };
  }, [agentConfigurations, sortAgents]);

  const { filteredAgents, filteredTags, uniqueTags, noTagsDefined } =
    useMemo(() => {
      const tags = agentConfigurations.flatMap((a) => a.tags);
      // Remove duplicate tags by unique sId
      const uniqueTags = Array.from(
        new Map(tags.map((tag) => [tag.sId, tag])).values()
      ).sort(tagsSorter);

      // Always unshift most popular at the beginning
      uniqueTags.unshift(MOST_POPULAR_TAG);

      // Always append others at the end
      uniqueTags.push(OTHERS_TAG);

      if (assistantSearch.trim() === "") {
        return {
          filteredAgents: [],
          filteredTags: [],
          uniqueTags,
          noTagsDefined: uniqueTags.length === 2, // Only most popular and others
        };
      }
      const search = assistantSearch.toLowerCase().trim().replace(/^@/, "");

      const filteredAgents: LightAgentConfigurationType[] = agentConfigurations
        .filter(
          (a) =>
            a.status === "active" &&
            // Filters on search query
            subFilter(search, getAgentSearchString(a))
        )

        .sort((a, b) => {
          return (
            compareForFuzzySort(
              assistantSearch,
              getAgentSearchString(a),
              getAgentSearchString(b)
            ) || (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
          );
        });

      const filteredTags = uniqueTags.filter((t) =>
        subFilter(search, t.name.toLowerCase())
      );

      return {
        filteredAgents,
        filteredTags,
        uniqueTags,
        noTagsDefined: uniqueTags.length === 2, // Only most popular and others
      };
    }, [agentConfigurations, assistantSearch]);

  // check the query string for the tab to show, the query param to look for is called "selectedTab"
  // if it's not found, show the first tab with agents
  const viewTab = useMemo(() => {
    const enabledTabs = AGENTS_TABS.filter(
      (tab) => agentsByTab[tab.id].length > 0
    );
    return selectedTab &&
      isValidTab(
        selectedTab,
        enabledTabs.map((tab) => tab.id)
      )
      ? selectedTab
      : enabledTabs[0]?.id;
  }, [selectedTab, agentsByTab]);

  // Initialize selectedTags from persisted selection (or default to Most popular).
  useEffect(() => {
    if (noTagsDefined || selectedTags.length > 0) {
      return;
    }

    const validTagIds = new Set(uniqueTags.map((t) => t.sId));
    const persistedValid = persistedSelectedTagIds.filter((id) =>
      validTagIds.has(id)
    );

    if (persistedValid.length > 0) {
      setSelectedTags(persistedValid);
    } else {
      setSelectedTags([MOST_POPULAR_TAG.sId]);
    }
  }, [
    noTagsDefined,
    persistedSelectedTagIds,
    uniqueTags,
    selectedTags.length,
    setSelectedTags,
  ]);

  // Persist selectedTags when they change (and tags exist).
  useEffect(() => {
    if (noTagsDefined || isPersistedSelectionLoading) {
      return;
    }

    const areEqual =
      persistedSelectedTagIds.length === selectedTags.length &&
      persistedSelectedTagIds.every((v, i) => v === selectedTags[i]);
    if (!areEqual) {
      void setSelectedTagIds(selectedTags);
    }
  }, [
    selectedTags,
    noTagsDefined,
    isPersistedSelectionLoading,
    persistedSelectedTagIds,
    setSelectedTagIds,
  ]);

  const sortTypeLabel = useMemo(() => {
    switch (sortType) {
      case "popularity":
        return "By popularity";
      case "alphabetical":
        return "Alphabetical";
      case "updated":
        return "Recently updated";
    }
  }, [sortType]);

  const isAllSelected = useMemo(() => {
    return selectedTags.length > 0 && selectedTags.length === uniqueTags.length;
  }, [selectedTags, uniqueTags.length]);

  const toggleSelectAll = useCallback(() => {
    if (noTagsDefined) {
      return;
    }
    if (isAllSelected) {
      const first = selectedTags[0] ?? uniqueTags[0]?.sId;
      setSelectedTags(first ? [first] : []);
    } else {
      setSelectedTags(uniqueTags.map((t) => t.sId));
    }
  }, [isAllSelected, noTagsDefined, selectedTags, uniqueTags]);

  return (
    <>
      {/* Search bar */}
      <div
        id="search-container"
        className="mb-2 flex w-full flex-row items-center justify-center gap-2 align-middle"
      >
        <SearchDropdownMenu
          searchInputValue={assistantSearch}
          setSearchInputValue={setAssistantSearch}
        >
          {filteredTags.length > 0 || filteredAgents.length > 0 ? (
            <>
              {filteredTags.length > 0 && <DropdownMenuLabel label="Tags" />}
              {filteredTags.map((tag) => (
                <DropdownMenuItem
                  key={tag.sId}
                  onClick={() => {
                    setSelectedTab("all");
                    setAssistantSearch("");
                    setTimeout(() => {
                      const element = document.getElementById(
                        `anchor-${tag.sId}`
                      );
                      if (element) {
                        element.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                          inline: "nearest",
                        });
                      }
                    }, 300); // Need to wait for the dropdown to close before scrolling
                  }}
                >
                  <Chip label={tag.name} color="golden" size="xs" />
                </DropdownMenuItem>
              ))}
              {filteredAgents.length > 0 && (
                <DropdownMenuLabel label="Agents" />
              )}
              {filteredAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.sId}
                  onClick={() => {
                    handleAssistantClick(agent);
                    setAssistantSearch("");
                  }}
                  truncateText
                  label={agent.name}
                  description={agent.description}
                  icon={() => <Avatar size="sm" visual={agent.pictureUrl} />}
                  endComponent={
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={MoreIcon}
                      onClick={(e: Event) => {
                        e.stopPropagation();
                        setQueryParam(router, "agentDetails", agent.sId);
                      }}
                    />
                  }
                />
              ))}
            </>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner variant={isDark ? "light" : "dark"} size="md" />
            </div>
          ) : (
            <div className="p-2 text-sm text-gray-500">No results found</div>
          )}
        </SearchDropdownMenu>

        <div className="hidden sm:block">
          <div className="flex gap-2">
            {!isRestrictedFromAgentCreation && (
              <div ref={createAgentButtonRef}>
                <CreateAgentButton owner={owner} dataGtmLocation="homepage" />
              </div>
            )}

            <Button
              href={getAgentBuilderRoute(owner.sId, "manage")}
              variant="primary"
              icon={ContactsRobotIcon}
              label="Manage agents"
              data-gtm-label="assistantManagementButton"
              data-gtm-location="homepage"
              size="sm"
            />
          </div>
        </div>
      </div>

      <AssistantDetails
        owner={owner}
        user={user}
        assistantId={displayedAssistantId}
        onClose={() => setDisplayedAssistantId(null)}
      />

      {/* Agent tabs */}
      <div className="w-full">
        <ScrollArea aria-orientation="horizontal">
          <Tabs value={viewTab} onValueChange={setSelectedTab}>
            <TabsList>
              {AGENTS_TABS.map((tab) => (
                <TabsTrigger
                  disabled={agentsByTab[tab.id].length === 0}
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                />
              ))}
              <div className="ml-auto"></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    isSelect
                    variant="outline"
                    label={sortTypeLabel}
                    size="sm"
                  />
                </DropdownMenuTrigger>

                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="By popularity"
                    onClick={() => setSortType("popularity")}
                  />
                  <DropdownMenuItem
                    label="Alphabetical"
                    onClick={() => setSortType("alphabetical")}
                  />
                  <DropdownMenuItem
                    label="Recently updated"
                    onClick={() => setSortType("updated")}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="hidden" />
        </ScrollArea>
      </div>

      {viewTab === "all" ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {noTagsDefined ? null : (
              <>
                {uniqueTags.map((tag) => (
                  <Button
                    size="xs"
                    variant={
                      selectedTags.includes(tag.sId) ? "primary" : "outline"
                    }
                    key={tag.sId}
                    label={tag.name}
                    onClick={() => {
                      if (selectedTags.includes(tag.sId)) {
                        setSelectedTags(
                          selectedTags.filter((t) => t !== tag.sId)
                        );
                      } else {
                        setSelectedTags([...selectedTags, tag.sId]);
                      }
                    }}
                  />
                ))}
                <Button
                  className="ml-auto"
                  size="xs"
                  variant="ghost"
                  label={isAllSelected ? "Unselect all" : "Select all"}
                  onClick={toggleSelectAll}
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {uniqueTags
              .filter(
                (t) =>
                  // User picked specific tag(s).
                  selectedTags.includes(t.sId) ||
                  // No tags are defined, show most popular & others.
                  noTagsDefined
              )
              .map((tag) => (
                <React.Fragment key={tag.sId}>
                  <a id={`anchor-${tag.sId}`} />
                  <span className="heading-base">{tag.name}</span>
                  <AgentGrid
                    agentConfigurations={agentsByTab.all.filter((a) => {
                      return (
                        // One of the tags is the selected tag.
                        a.tags.some((t) => t.sId === tag.sId) ||
                        // Selected tag is others, and the agent has no tags.
                        (tag.sId === OTHERS_TAG.sId &&
                          a.tags.length === 0 &&
                          // Exclude agents that are in the most popular list.
                          !agentsByTab.most_popular.some(
                            (a_popular) => a_popular.sId === a.sId
                          )) ||
                        // Selected tag is most popular, and the agent is in the most popular list.
                        (tag.sId === MOST_POPULAR_TAG.sId &&
                          agentsByTab.most_popular.some(
                            (a_popular) => a_popular.sId === a.sId
                          ))
                      );
                    })}
                    handleAssistantClick={handleAssistantClick}
                    handleMoreClick={setDisplayedAssistantId}
                    owner={owner}
                  />
                </React.Fragment>
              ))}
          </div>
        </>
      ) : (
        viewTab && (
          <AgentGrid
            agentConfigurations={agentsByTab[viewTab]}
            handleAssistantClick={handleAssistantClick}
            handleMoreClick={setDisplayedAssistantId}
            owner={owner}
          />
        )
      )}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}
    </>
  );
}
