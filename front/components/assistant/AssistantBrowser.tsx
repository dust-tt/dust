import {
  AssistantCard,
  AssistantCardMore,
  Button,
  CardGrid,
  CompanyIcon,
  LockIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RobotIcon,
  RocketIcon,
  ScrollArea,
  ScrollBar,
  SearchInput,
  StarIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  useHashParam,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

const ALL_AGENTS_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  { label: "Favorites", icon: StarIcon, id: "favorites" },
  { label: "Most popular", icon: RocketIcon, id: "most_popular" },
  { label: "Company", icon: CompanyIcon, id: "workspace" },
  { label: "Shared", icon: UserGroupIcon, id: "published" },
  { label: "Personal", icon: LockIcon, id: "personal" },
  { label: "All", icon: RobotIcon, id: "all" },
  {
    label: "Searching across all agents",
    icon: MagnifyingGlassIcon,
    id: "search",
  },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

interface AssistantListProps {
  owner: WorkspaceType;
  isBuilder: boolean;
  agents: LightAgentConfigurationType[];
  loadingStatus: "loading" | "finished";
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
}

export function AssistantBrowser({
  owner,
  isBuilder,
  agents,
  loadingStatus,
  handleAssistantClick,
}: AssistantListProps) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [selectedTab, setSelectedTab] = useHashParam(
    "selectedTab",
    "favorites"
  );

  const router = useRouter();

  const agentsByTab = useMemo(() => {
    const filteredAgents: LightAgentConfigurationType[] = agents
      .filter(
        (a) =>
          a.status === "active" &&
          // Filters on search query
          (assistantSearch.trim() === "" ||
            subFilter(
              assistantSearch.toLowerCase().trim().replace(/^@/, ""),
              a.name.toLowerCase()
            ))
      )
      .sort((a, b) => {
        return compareForFuzzySort(
          assistantSearch.toLowerCase().trim(),
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      });

    return {
      // do not show the "all" tab while still loading all agents
      all: loadingStatus !== "finished" ? [] : filteredAgents,
      published: filteredAgents.filter((a) => a.scope === "published"),
      workspace: filteredAgents.filter((a) => a.scope === "workspace"),
      personal: filteredAgents.filter((a) => a.scope === "private"),
      favorites: filteredAgents.filter((a) => a.userFavorite),
      most_popular: filteredAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
        ),
      search: loadingStatus !== "finished" ? [] : filteredAgents,
    };
  }, [assistantSearch, loadingStatus, agents]);

  // if search is active, only show the search tab, otherwise show all tabs with agents except the search tab
  const visibleTabs = useMemo(() => {
    const searchTab = ALL_AGENTS_TABS.find((tab) => tab.id === "search");
    if (!searchTab) {
      throw new Error("Unexpected: Search tab not found");
    }

    return assistantSearch.trim() !== ""
      ? [searchTab]
      : ALL_AGENTS_TABS.filter(
          (tab) => agentsByTab[tab.id].length > 0 && tab.id !== "search"
        );
  }, [agentsByTab, assistantSearch]);

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

  return (
    <>
      {/* Search bar */}
      <div
        id="search-container"
        className="flex w-full flex-row items-center justify-center gap-2 align-middle"
      >
        <SearchInput
          name="search"
          placeholder="Search (Name)"
          value={assistantSearch}
          onChange={setAssistantSearch}
        />
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

            {isBuilder && (
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

      {!viewTab && (
        <div className="my-12 text-center text-sm text-muted-foreground">
          No agents found. Try adjusting your search criteria.
        </div>
      )}

      {viewTab && (
        <CardGrid className="mb-12">
          {agentsByTab[viewTab].map((agent) => (
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
                    setQueryParam(router, "assistantDetails", agent.sId);
                  }}
                />
              }
            />
          ))}
        </CardGrid>
      )}
    </>
  );
}
