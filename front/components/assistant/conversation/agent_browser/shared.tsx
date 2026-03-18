import { AgentDetailsDropdownMenu } from "@app/components/assistant/details/AgentDetailsButtonBar";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  AssistantCard,
  AssistantCardMore,
  Avatar,
  Button,
  CardGrid,
  Chip,
  DropdownMenuItem,
  DropdownMenuLabel,
  MoreIcon,
  SearchDropdownMenu,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

export const AGENTS_TABS = [
  { label: "Favorites", id: "favorites" },
  { label: "All agents", id: "all" },
  { label: "Editable by me", id: "editable_by_me" },
] as const;

export type TabId = (typeof AGENTS_TABS)[number]["id"];

export type SortType = "popularity" | "alphabetical" | "updated";

export type AgentsByTab = {
  all: LightAgentConfigurationType[];
  favorites: LightAgentConfigurationType[];
  editable_by_me: LightAgentConfigurationType[];
  most_popular: LightAgentConfigurationType[];
};

export const MOST_POPULAR_TAG: TagType = {
  sId: "--most_popular--",
  name: "Most popular",
  kind: "protected",
};

export const ALL_TAG: TagType = {
  sId: "--all--",
  name: "All",
  kind: "protected",
};

export const OTHERS_TAG: TagType = {
  sId: "--others--",
  name: "Others",
  kind: "protected",
};

export function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

export type AgentBrowserSharedProps = {
  owner: WorkspaceType;
  isLoading: boolean;
  handleAgentClick: (agent: LightAgentConfigurationType) => void;
  assistantSearch: string;
  setAssistantSearch: (v: string) => void;
  filteredTags: TagType[];
  filteredAgents: LightAgentConfigurationType[];
  agentsByTab: AgentsByTab;
  viewTab: TabId | undefined;
  setSelectedTab: (tab: string) => void;
  uniqueTags: TagType[];
  noTagsDefined: boolean;
  selectedTag: string | null;
  setSelectedTag: (tag: string) => void;
  setDisplayedAssistantId: (id: string) => void;
};

export type WebAgentBrowserProps = AgentBrowserSharedProps & {
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
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

  const clientType = useClientType();
  const isMobile = useIsMobile();

  // Handle "infinite" scroll
  // We only start with 9 items shown (no need more on mobile) and load more until we fill the parent container.
  // We use an intersection observer to detect when the bottom of the list is visible and load more items.
  // That way, the list starts lightweight and only show more items when needed.
  const ITEMS_PER_PAGE = 9; // Should be a multiple of 3

  const [itemsPage, setItemsPage] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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

  const isMobileOrExtension = clientType === "extension" || isMobile;

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
              iconSize={isMobileOrExtension ? "sm" : "md"}
              action={
                isMobileOrExtension ? undefined : (
                  <AssistantCardMore
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      handleMoreClick(agent.sId);
                    }}
                  />
                )
              }
            />
          );
        })}
      </CardGrid>
      <AgentDetailsDropdownMenu
        agentConfiguration={contextMenuAgent ?? undefined}
        owner={owner}
        onClose={() => {
          setContextMenuPosition(null);
        }}
        showEditOption={true}
        contextMenuPosition={contextMenuPosition ?? undefined}
      />
    </>
  );
};

type SearchDropdownContentProps = {
  filteredTags: TagType[];
  filteredAgents: LightAgentConfigurationType[];
  isLoading: boolean;
  onTagClick: (tagSId: string) => void;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
  onAgentMoreClick?: (agentSId: string) => void;
};

export function SearchDropdownContent({
  filteredTags,
  filteredAgents,
  isLoading,
  onTagClick,
  onAgentClick,
  onAgentMoreClick,
}: SearchDropdownContentProps) {
  if (filteredTags.length === 0 && filteredAgents.length === 0) {
    return isLoading ? (
      <div className="flex justify-center py-8">
        <Spinner size="md" />
      </div>
    ) : (
      <div className="p-2 text-sm text-gray-500">No results found</div>
    );
  }
  return (
    <>
      {filteredTags.length > 0 && <DropdownMenuLabel label="Tags" />}
      {filteredTags.map((tag) => (
        <DropdownMenuItem key={tag.sId} onClick={() => onTagClick(tag.sId)}>
          <Chip label={tag.name} color="golden" size="xs" />
        </DropdownMenuItem>
      ))}
      {filteredAgents.length > 0 && <DropdownMenuLabel label="Agents" />}
      {filteredAgents.map((agent) => (
        <DropdownMenuItem
          key={agent.sId}
          onClick={() => onAgentClick(agent)}
          truncateText
          label={agent.name}
          description={agent.description}
          icon={() => <Avatar size="sm" visual={agent.pictureUrl} />}
          endComponent={
            onAgentMoreClick ? (
              <Button
                variant="ghost"
                size="xs"
                icon={MoreIcon}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onAgentMoreClick(agent.sId);
                }}
              />
            ) : undefined
          }
        />
      ))}
    </>
  );
}

export function useTagClick(
  setSelectedTab: (tab: string) => void,
  setAssistantSearch: (v: string) => void,
  setSelectedTag: (tag: string) => void
) {
  return useCallback(
    (tagSId: string) => {
      setSelectedTab("all");
      setAssistantSearch("");
      setSelectedTag(tagSId);
      setTimeout(() => {
        const element = document.getElementById(`anchor-${tagSId}`);
        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
          });
        }
      }, 300); // Need to wait for the dropdown to close before scrolling
    },
    [setSelectedTab, setAssistantSearch, setSelectedTag]
  );
}

type AllTabContentProps = {
  noTagsDefined: boolean;
  uniqueTags: TagType[];
  selectedTag: string | null;
  setSelectedTag: (tag: string) => void;
  agentsByTab: AgentsByTab;
  handleAgentClick: (agent: LightAgentConfigurationType) => void;
  setDisplayedAssistantId: (id: string) => void;
  owner: WorkspaceType;
  showTagHeadings: boolean;
};

export function AllTabContent({
  noTagsDefined,
  uniqueTags,
  selectedTag,
  setSelectedTag,
  agentsByTab,
  handleAgentClick,
  setDisplayedAssistantId,
  owner,
  showTagHeadings,
}: AllTabContentProps) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!noTagsDefined && (
          <>
            {uniqueTags.map((tag) => (
              <Button
                size="xs"
                variant={selectedTag === tag.sId ? "primary" : "outline"}
                key={tag.sId}
                label={tag.name}
                onClick={() => setSelectedTag(tag.sId)}
              />
            ))}
          </>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {uniqueTags
          .filter((t) => selectedTag === t.sId || noTagsDefined)
          .map((tag) => (
            <React.Fragment key={tag.sId}>
              <a id={`anchor-${tag.sId}`} />
              {showTagHeadings && (
                <span className="heading-base">{tag.name}</span>
              )}
              <AgentGrid
                agentConfigurations={agentsByTab.all.filter((a) => {
                  return (
                    a.tags.some((t) => t.sId === tag.sId) ||
                    (tag.sId === OTHERS_TAG.sId &&
                      a.tags.length === 0 &&
                      !agentsByTab.most_popular.some(
                        (ap) => ap.sId === a.sId
                      )) ||
                    (tag.sId === MOST_POPULAR_TAG.sId &&
                      agentsByTab.most_popular.some(
                        (ap) => ap.sId === a.sId
                      )) ||
                    (tag.sId === ALL_TAG.sId &&
                      agentsByTab.all.some((ap) => ap.sId === a.sId))
                  );
                })}
                handleAssistantClick={handleAgentClick}
                handleMoreClick={setDisplayedAssistantId}
                owner={owner}
              />
            </React.Fragment>
          ))}
      </div>
    </>
  );
}

export function AgentBrowserSearchDropdown({
  assistantSearch,
  setAssistantSearch,
  filteredTags,
  filteredAgents,
  isLoading,
  onTagClick,
  onAgentClick,
  onAgentMoreClick,
}: {
  assistantSearch: string;
  setAssistantSearch: (v: string) => void;
  filteredTags: TagType[];
  filteredAgents: LightAgentConfigurationType[];
  isLoading: boolean;
  onTagClick: (tagSId: string) => void;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
  onAgentMoreClick?: (agentSId: string) => void;
}) {
  return (
    <SearchDropdownMenu
      searchInputValue={assistantSearch}
      setSearchInputValue={setAssistantSearch}
    >
      <SearchDropdownContent
        filteredTags={filteredTags}
        filteredAgents={filteredAgents}
        isLoading={isLoading}
        onTagClick={onTagClick}
        onAgentClick={onAgentClick}
        onAgentMoreClick={onAgentMoreClick}
      />
    </SearchDropdownMenu>
  );
}
