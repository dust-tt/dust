import {
  AssistantPreview,
  Button,
  ListAddIcon,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  RocketIcon,
  Searchbar,
  Tab,
  Tooltip,
  UserGroupIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

import { subFilter } from "@app/lib/utils";

interface AssistantListProps {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  // for speed purposes, there is a partially loaded state for which we
  // can show a subset of the agents
  loadingStatus: "loading" | "partial" | "finished";
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
}

const ALL_AGENTS_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  { label: "Most popular", icon: RocketIcon, id: "most_popular" },
  { label: "Company", icon: PlanetIcon, id: "workspace" },
  { label: "Shared", icon: UserGroupIcon, id: "published" },
  { label: "Personal", icon: UserIcon, id: "personal" },
  { label: "In my list", icon: ListAddIcon, id: "list" },
  { label: "All", icon: RobotIcon, id: "all" },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

export function AssistantBrowser({
  owner,
  agents,
  loadingStatus,
  handleAssistantClick,
}: AssistantListProps) {
  const router = useRouter();
  const [assistantSearch, setAssistantSearch] = useState<string>("");

  const agentsByTab = useMemo(() => {
    const filteredAgents: LightAgentConfigurationType[] = agents.filter(
      (a) =>
        a.status === "active" &&
        // Filters on search query
        (assistantSearch.trim() === "" ||
          subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase()))
    );

    return {
      // do not show the "all" tab while still loading all agents
      all: loadingStatus !== "finished" ? [] : filteredAgents,
      published: filteredAgents.filter((a) => a.scope === "published"),
      workspace: filteredAgents.filter((a) => a.scope === "workspace"),
      personal: filteredAgents.filter((a) => a.scope === "private"),
      list: filteredAgents.filter(
        (a) => a.scope === "published" && a.userListStatus === "in-list"
      ),
      // TODO: Implement most popular agents (upcoming PR for issue #5454)
      most_popular: filteredAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0)
        )
        .slice(0, 0), // Placeholder -- most popular agents are not implemented yet
    };
  }, [assistantSearch, loadingStatus, agents]);

  const visibleTabs = useMemo(() => {
    return ALL_AGENTS_TABS.filter((tab) => agentsByTab[tab.id].length > 0);
  }, [agentsByTab]);

  const [selectedTab, setSelectedTab] = useState<TabId | null>(
    visibleTabs[0]?.id || null
  );

  const displayedTab =
    assistantSearch.trim() !== "" // If search is active, show all agents
      ? "all"
      : visibleTabs.find((tab) => tab.id === selectedTab)
      ? selectedTab
      : visibleTabs.length > 0
      ? visibleTabs[0].id
      : null;

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
        <Button.List>
          <Tooltip label="Create your own assistant">
            <Link
              href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
            >
              <div className="hidden sm:block">
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create An Assistant"
                  size="sm"
                />
              </div>
              <div className="sm:hidden">
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create An Assistant"
                  labelVisible={false}
                  size="sm"
                  className="sm:hidden"
                />
              </div>
            </Link>
          </Tooltip>
        </Button.List>
      </div>

      {/* Assistant tabs */}
      <div className="flex flex-row space-x-4 px-4">
        <Tab
          className="grow"
          tabs={visibleTabs.map((tab) => ({
            ...tab,
            current: tab.id === displayedTab,
          }))}
          setCurrentTab={setSelectedTab}
        />
      </div>
      {!displayedTab && (
        <div className="text-center">
          No assistants found. Try adjusting your search criteria.
        </div>
      )}

      {displayedTab && (
        <div className="grid w-full grid-cols-1 gap-2 px-4 md:grid-cols-3">
          {agentsByTab[displayedTab].map((agent) => {
            const href = {
              pathname: router.pathname,
              query: {
                ...router.query,
                assistantDetails: agent.sId,
              },
            };
            return (
              <div
                key={agent.sId}
                className="rounded-xl border border-structure-100"
              >
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    handleAssistantClick(agent);
                  }}
                >
                  <AssistantPreview
                    title={agent.name}
                    pictureUrl={agent.pictureUrl}
                    subtitle={agent.lastAuthors?.join(", ") ?? ""}
                    description=""
                    variant="minimal"
                    onClick={() => handleAssistantClick(agent)}
                    onActionClick={() => {
                      // Shallow routing to avoid re-fetching the page
                      void router.replace(href, undefined, { shallow: true });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
