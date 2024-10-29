import {
  AssistantPreview,
  Button,
  CompanyIcon,
  LockIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RobotIcon,
  RocketIcon,
  Searchbar,
  StarIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  useHashParam,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import { AssistantDropdownMenu } from "@app/components/assistant/AssistantDropdownMenu";
import { subFilter } from "@app/lib/utils";

function isValidTab(tab: string, visibleTabs: TabId[]): tab is TabId {
  return visibleTabs.includes(tab as TabId);
}

interface AssistantListProps {
  owner: WorkspaceType;
  user: UserType;
  isBuilder: boolean;
  agents: LightAgentConfigurationType[];
  loadingStatus: "loading" | "finished";
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
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
    label: "Searching across all assistants",
    icon: MagnifyingGlassIcon,
    id: "search",
  },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

export function AssistantBrowser({
  owner,
  user,
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
        return a.name
          .toLocaleLowerCase()
          .localeCompare(b.name.toLocaleLowerCase());
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
        className="flex w-full flex-row items-center justify-center gap-4 px-4 align-middle"
      >
        <Searchbar
          name="search"
          size="sm"
          placeholder="Search (Name)"
          value={assistantSearch}
          onChange={setAssistantSearch}
        />
        <div className="hidden sm:block">
          <div className="flex gap-2">
            <Tooltip
              label="Create your own assistant"
              tooltipTriggerAsChild
              trigger={
                <Link
                  href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
                >
                  <Button
                    variant="primary"
                    icon={PlusIcon}
                    label="Create"
                    size="sm"
                  />
                  <div className="sm:hidden">
                    <Button
                      variant="primary"
                      icon={PlusIcon}
                      size="sm"
                      className="sm:hidden"
                    />
                  </div>
                </Link>
              }
            />
            {isBuilder && (
              <Tooltip
                label="Manage assistants"
                tooltipTriggerAsChild
                trigger={
                  <Link href={`/w/${owner.sId}/builder/assistants/`}>
                    <Button
                      variant="primary"
                      icon={RobotIcon}
                      label="Manage"
                      size="sm"
                    />
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Assistant tabs */}
      <div className="flex flex-row space-x-4 px-4">
        <Tabs className="w-full" value={viewTab} onValueChange={setSelectedTab}>
          <TabsList className="inline-flex h-10 items-center gap-2 border-b border-separator">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                label={tab.label}
                icon={tab.icon}
                className={
                  assistantSearch !== ""
                    ? "border-element-700 text-element-700"
                    : ""
                }
              />
            ))}
          </TabsList>
        </Tabs>
      </div>
      {!viewTab && (
        <div className="text-center">
          No assistants found. Try adjusting your search criteria.
        </div>
      )}

      {viewTab && (
        <div className="relative grid w-full grid-cols-1 gap-2 px-4 md:grid-cols-3">
          {agentsByTab[viewTab].map((agent) => (
            <AssistantPreview
              key={agent.sId}
              title={agent.name}
              pictureUrl={agent.pictureUrl}
              subtitle={agent.lastAuthors?.join(", ") ?? ""}
              description={agent.description}
              variant="minimal"
              onClick={() => handleAssistantClick(agent)}
              actionElement={
                <AssistantDropdownMenu
                  agentConfiguration={agent}
                  owner={owner}
                  user={user}
                  variant="button"
                  isMoreInfoVisible
                  showAddRemoveToFavorite
                  canDelete
                />
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
