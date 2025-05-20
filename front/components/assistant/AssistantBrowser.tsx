import {
  AssistantCard,
  AssistantCardMore,
  Avatar,
  Button,
  CardGrid,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  MoreIcon,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  ScrollBar,
  SearchDropdownMenu,
  Spinner,
  StarIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  useHashParam,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useState } from "react";

import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

const AGENTS_TABS = [
  { label: "Favorites", icon: StarIcon, id: "favorites" },
  { label: "All agents", icon: RobotIcon, id: "all" },
  { label: "Editable by me", icon: PencilSquareIcon, id: "editable_by_me" },
] as const;

type TabId = (typeof AGENTS_TABS)[number]["id"];

type AgentGridProps = {
  agentConfigurations: LightAgentConfigurationType[];
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
  handleMoreClick: (agent: LightAgentConfigurationType) => void;
};
export const AgentGrid = ({
  agentConfigurations,
  handleAssistantClick,
  handleMoreClick,
}: AgentGridProps) => {
  return (
    <CardGrid>
      {agentConfigurations.map((agent) => (
        <AssistantCard
          key={agent.sId}
          title={agent.name}
          pictureUrl={agent.pictureUrl}
          subtitle={agent.lastAuthors?.join(", ") ?? ""}
          description={agent.description}
          onClick={() => handleAssistantClick(agent)}
          action={
            <AssistantCardMore
              onClick={(e: Event) => {
                e.stopPropagation();
                handleMoreClick(agent);
              }}
            />
          }
        />
      ))}
    </CardGrid>
  );
};

interface AssistantBrowserProps {
  owner: WorkspaceType;
  agentConfigurations: LightAgentConfigurationType[];
  isLoading: boolean;
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
}

export function AssistantBrowser({
  owner,
  agentConfigurations,
  isLoading,
  handleAssistantClick,
}: AssistantBrowserProps) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [selectedTab, setSelectedTab] = useHashParam(
    "selectedTab",
    "favorites"
  );

  const router = useRouter();
  const { createAgentButtonRef } = useWelcomeTourGuide();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { isDark } = useTheme();
  const [sortType, setSortType] = useState<"popularity" | "alphabetical">(
    "popularity"
  );

  const sortAgents = useCallback(
    (a: LightAgentConfigurationType, b: LightAgentConfigurationType) => {
      if (sortType === "popularity") {
        return (
          (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0) ||
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
      untagged: allAgents.filter((a) => a.tags.length === 0),
      // TODO(agent-discovery): Remove this once old scopes are removed
      personal: allAgents.filter((a) => a.scope === "private"),
      published: allAgents.filter((a) => a.scope === "published"),
      workspace: allAgents.filter((a) => a.scope === "workspace"),
      // END-TODO(agent-discovery)
    };
  }, [agentConfigurations, sortAgents]);

  const { filteredAgents, filteredTags, uniqueTags } = useMemo(() => {
    const tags = agentConfigurations.flatMap((a) => a.tags);
    // Remove duplicate tags by unique sId
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.sId, tag])).values()
    ).sort(tagsSorter);

    if (assistantSearch.trim() === "") {
      return { filteredAgents: [], filteredTags: [], uniqueTags };
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

    return { filteredAgents, filteredTags, uniqueTags };
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

  const handleMoreClick = (agent: LightAgentConfigurationType) => {
    setQueryParam(router, "assistantDetails", agent.sId);
  };

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
                    if (selectedTags.includes(tag.sId)) {
                      setSelectedTags(
                        selectedTags.filter((t) => t !== tag.sId)
                      );
                    } else {
                      setSelectedTags([...selectedTags, tag.sId]);
                    }
                    setAssistantSearch("");
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
                        setQueryParam(router, "assistantDetails", agent.sId);
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
            <div ref={createAgentButtonRef}>
              <Button
                tooltip="Create your own agent"
                href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
                variant="primary"
                icon={PlusIcon}
                label="Create"
                data-gtm-label="assistantCreationButton"
                data-gtm-location="homepage"
                size="sm"
              />
            </div>

            <Button
              tooltip="Manage agents"
              href={`/w/${owner.sId}/builder/assistants/`}
              variant="primary"
              icon={RobotIcon}
              label="Manage"
              data-gtm-label="assistantManagementButton"
              data-gtm-location="homepage"
              size="sm"
            />
          </div>
        </div>
      </div>

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
                  icon={tab.icon}
                />
              ))}
              <div className="ml-auto"></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    isSelect
                    variant="outline"
                    label={
                      sortType === "popularity"
                        ? "By popularity"
                        : "Alphabetical"
                    }
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
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="hidden" />
        </ScrollArea>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}

      {viewTab === "all" ? (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {uniqueTags.map((tag) => (
              <Button
                size="xs"
                variant={selectedTags.includes(tag.sId) ? "primary" : "outline"}
                key={tag.sId}
                label={tag.name}
                onClick={() => {
                  if (selectedTags.includes(tag.sId)) {
                    setSelectedTags(selectedTags.filter((t) => t !== tag.sId));
                  } else {
                    setSelectedTags([...selectedTags, tag.sId]);
                  }
                }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {selectedTags.length === 0 && (
              <>
                <span className="heading-base">Most popular</span>
                <AgentGrid
                  agentConfigurations={agentsByTab.most_popular}
                  handleAssistantClick={handleAssistantClick}
                  handleMoreClick={handleMoreClick}
                />
              </>
            )}
            {uniqueTags
              .filter(
                (t) => selectedTags.length === 0 || selectedTags.includes(t.sId)
              )
              .map((tag) => (
                <React.Fragment key={tag.sId}>
                  <span className="heading-base">{tag.name}</span>
                  <AgentGrid
                    agentConfigurations={agentsByTab.all.filter((a) =>
                      a.tags.some((t) => t.sId === tag.sId)
                    )}
                    handleAssistantClick={handleAssistantClick}
                    handleMoreClick={handleMoreClick}
                  />
                </React.Fragment>
              ))}
            {selectedTags.length === 0 && agentsByTab.untagged.length > 0 && (
              <React.Fragment>
                <span className="heading-base">Others</span>
                <AgentGrid
                  agentConfigurations={agentsByTab.untagged}
                  handleAssistantClick={handleAssistantClick}
                  handleMoreClick={handleMoreClick}
                />
              </React.Fragment>
            )}
          </div>
        </>
      ) : (
        viewTab && (
          <AgentGrid
            agentConfigurations={agentsByTab[viewTab]}
            handleAssistantClick={handleAssistantClick}
            handleMoreClick={handleMoreClick}
          />
        )
      )}
    </>
  );
}
