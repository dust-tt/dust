import {
  AssistantPreview,
  Button,
  ListAddIcon,
  LockIcon,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  RocketIcon,
  Searchbar,
  Tab,
  Tooltip,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import type { KeyedMutator } from "swr";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantDetailsDropdownMenu } from "@app/components/assistant/AssistantDetailsDropdownMenu";
import { subFilter } from "@app/lib/utils";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

interface AssistantListProps {
  owner: WorkspaceType;
  isBuilder: boolean;
  agents: LightAgentConfigurationType[];
  loadingStatus: "loading" | "finished";
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
  mutateAgentConfigurations: KeyedMutator<GetAgentConfigurationsResponseBody>;
}

const ALL_AGENTS_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  { label: "Most popular", icon: RocketIcon, id: "most_popular" },
  { label: "Company", icon: PlanetIcon, id: "workspace" },
  { label: "Shared", icon: UserGroupIcon, id: "published" },
  { label: "Personal", icon: LockIcon, id: "personal" },
  { label: "In my list", icon: ListAddIcon, id: "list" },
  { label: "All", icon: RobotIcon, id: "all" },
] as const;

type TabId = (typeof ALL_AGENTS_TABS)[number]["id"];

export function AssistantBrowser({
  owner,
  isBuilder,
  agents,
  loadingStatus,
  handleAssistantClick,
  mutateAgentConfigurations,
}: AssistantListProps) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [assistantIdToShow, setAssistantIdToShow] = useState<string | null>(
    null
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
      list: filteredAgents.filter(
        (a) => a.scope === "published" && a.userListStatus === "in-list"
      ),
      most_popular: filteredAgents
        .filter((a) => a.usage && a.usage.messageCount > 0)
        .sort(
          (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
        ),
    };
  }, [assistantSearch, loadingStatus, agents]);

  const visibleTabs = useMemo(() => {
    return ALL_AGENTS_TABS.filter((tab) => agentsByTab[tab.id].length > 0);
  }, [agentsByTab]);

  // check the query string for the tab to show, the query param to look for is called "defaultTab"
  // if it's not found, show the first tab with agents
  const defaultTab = useMemo(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const defaultTab = queryParams.get("defaultTab") as TabId | null;
    return visibleTabs.find((tab) => tab.id === defaultTab)
      ? defaultTab
      : visibleTabs[0]?.id;
  }, [visibleTabs]);

  const [selectedTab, setSelectedTab] = useState<TabId | null>(defaultTab);

  useEffect(() => {
    if (!selectedTab && defaultTab) {
      setSelectedTab(defaultTab);
    }
  }, [defaultTab, selectedTab]);

  const displayedTab =
    assistantSearch.trim() !== "" // If search is active, show all agents
      ? "all"
      : visibleTabs.find((tab) => tab.id === selectedTab)
        ? selectedTab
        : visibleTabs.length > 0
          ? visibleTabs[0].id
          : null;

  const isVaultsEnabled = owner.flags.includes("data_vaults_feature");
  const builderManageAssistantsRoute = isVaultsEnabled
    ? `/w/${owner.sId}/assistants/`
    : `/w/${owner.sId}/builder/assistants/`;

  return (
    <>
      <AssistantDetails
        assistantId={assistantIdToShow}
        onClose={() => setAssistantIdToShow(null)}
        owner={owner}
        mutateAgentConfigurations={mutateAgentConfigurations}
      />
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
                  label="Create"
                  size="sm"
                />
              </div>
              <div className="sm:hidden">
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create"
                  labelVisible={false}
                  size="sm"
                  className="sm:hidden"
                />
              </div>
            </Link>
          </Tooltip>
          {isBuilder && (
            <Tooltip label="Manage assistants">
              <Link href={builderManageAssistantsRoute}>
                <Button
                  variant="primary"
                  icon={RobotIcon}
                  label="Manage"
                  size="sm"
                />
              </Link>
            </Tooltip>
          )}
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
        <div className="relative grid w-full grid-cols-1 gap-2 px-4 md:grid-cols-3">
          {agentsByTab[displayedTab].map((agent) => (
            <AssistantPreview
              key={agent.sId}
              title={agent.name}
              pictureUrl={agent.pictureUrl}
              subtitle={agent.lastAuthors?.join(", ") ?? ""}
              description={agent.description}
              variant="minimal"
              onClick={() => handleAssistantClick(agent)}
              actionElement={
                <>
                  {/* TODO: get rid of the ugly hack */}
                  {/* Theses 2 divs are an ugly hack to align the button while making the dropdown menu visible above the container, it has the size of the button hardcoded -- Let's fix it asap */}
                  <div style={{ width: "56px" }}></div>{" "}
                  <div className="absolute">
                    <AssistantDetailsDropdownMenu
                      agentConfiguration={agent}
                      owner={owner}
                      variant="button"
                      showAssistantDetails={() =>
                        setAssistantIdToShow(agent.sId)
                      }
                      canDelete
                    />
                  </div>
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
