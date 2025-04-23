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
import React, { useMemo, useState } from "react";

import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";

function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

// const ALL_AGENTS_TABS = [
//   // default shown tab = earliest in this list with non-empty agents
//   { label: "Favorites", icon: StarIcon, id: "favorites" },
//   { label: "Most popular", icon: RocketIcon, id: "most_popular" },
//   { label: "Company", icon: CompanyIcon, id: "workspace" },
//   { label: "Shared", icon: UserGroupIcon, id: "published" },
//   { label: "Personal", icon: LockIcon, id: "personal" },
//   { label: "All", icon: RobotIcon, id: "all" },
// ] as const;

const ALL_AGENTS_TABS = [
  { label: "Favorites", icon: StarIcon, id: "favorites" },
  { label: "All agents", icon: RobotIcon, id: "all" },
  { label: "Editable by me", icon: PencilSquareIcon, id: "editable_by_me" },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const agentsByTab = useMemo(() => {
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => a.status === "active")
      .filter((a) => {
        if (selectedTags.length === 0) {
          return true;
        }
        return a.tags.some((t) => selectedTags.includes(t.sId));
      })
      .sort((a, b) => {
        return compareForFuzzySort(
          "",
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      });

    return {
      // do not show the "all" tab while still loading all agents
      all: allAgents,
      favorites: allAgents.filter((a) => a.userFavorite),
      editable_by_me: allAgents.filter(
        (a) =>
          isAdmin(owner) ||
          (a.scope === "published" && isBuilder(owner)) ||
          a.scope === "private" // TODO: add/replace with editors group check
      ),
      most_popular: allAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
        )
        .slice(0, 6),
    };
  }, [agentConfigurations, selectedTags, owner]);

  const { filteredAgents, filteredTags, uniqueTags } = useMemo(() => {
    const tags = agentConfigurations.flatMap((a) => a.tags);
    // Remove duplicate tags by unique sId
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.sId, tag])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (assistantSearch.trim() === "") {
      return { filteredAgents: [], filteredTags: [], uniqueTags };
    }
    const search = assistantSearch.toLowerCase().trim().replace(/^@/, "");
    const filteredAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter(
        (a) =>
          a.status === "active" &&
          // Filters on search query
          subFilter(search, a.name.toLowerCase())
      )

      .sort((a, b) => {
        return compareForFuzzySort(
          assistantSearch,
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      });

    const filteredTags = uniqueTags.filter((t) =>
      subFilter(search, t.name.toLowerCase())
    );

    return { filteredAgents, filteredTags, uniqueTags };
  }, [agentConfigurations, assistantSearch]);

  // if search is active, only show the search tab, otherwise show all tabs with agents except the search tab
  const visibleTabs = useMemo(() => {
    return ALL_AGENTS_TABS.filter((tab) => agentsByTab[tab.id].length > 0);
  }, [agentsByTab]);
  // check the query string for the tab to show, the query param to look for is called "selectedTab"
  // if it's not found, show the first tab with agents
  const viewTab = useMemo(() => {
    return selectedTab &&
      isValidTab(
        selectedTab,
        visibleTabs.map((tab) => tab.id)
      )
      ? selectedTab
      : visibleTabs[0]?.id;
  }, [selectedTab, visibleTabs]);

  const handleMoreClick = (agent: LightAgentConfigurationType) => {
    setQueryParam(router, "assistantDetails", agent.sId);
  };

  const untaggedAgents = useMemo(() => {
    return agentsByTab.all.filter((a) => a.tags.length === 0);
  }, [agentsByTab]);

  return (
    <>
      {/* Search bar */}
      <div
        id="search-container"
        className="flex w-full flex-row items-center justify-center gap-2 align-middle"
      >
        <SearchDropdownMenu
          searchInputValue={assistantSearch}
          setSearchInputValue={setAssistantSearch}
        >
          <ScrollArea className="max-h-[500px]">
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
                  >
                    <div className="flex items-center gap-2">
                      <Avatar visual={agent.pictureUrl} />
                      <div className="flex flex-col">
                        <div>{agent.name}</div>
                        <div className="text-sm text-gray-500">
                          {agent.description}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-grow flex-row items-center justify-end">
                      <Button
                        variant="outline"
                        size="xs"
                        icon={MoreIcon}
                        onClick={(e: Event) => {
                          e.stopPropagation();
                          setQueryParam(router, "assistantDetails", agent.sId);
                        }}
                      />
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            ) : isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner variant="dark" size="md" />
              </div>
            ) : (
              <div className="p-2 text-sm text-gray-500">No results found</div>
            )}
          </ScrollArea>
        </SearchDropdownMenu>

        <div className="hidden sm:block">
          <div className="flex gap-2">
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

            {isBuilder(owner) && (
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
            )}
          </div>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="w-full">
        <ScrollArea aria-orientation="horizontal">
          <Tabs value={viewTab} onValueChange={setSelectedTab}>
            <TabsList>
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="hidden" />
        </ScrollArea>
      </div>

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

      {viewTab === "all" ? (
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
          {selectedTags.length === 0 && untaggedAgents.length > 0 && (
            <React.Fragment>
              <span className="heading-base">Others</span>
              <AgentGrid
                agentConfigurations={untaggedAgents}
                handleAssistantClick={handleAssistantClick}
                handleMoreClick={handleMoreClick}
              />
            </React.Fragment>
          )}
        </div>
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
