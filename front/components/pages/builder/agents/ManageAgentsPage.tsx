import {
  Button,
  Chip,
  ContactsRobotIcon,
  ListSelectIcon,
  MagnifyingGlassIcon,
  Page,
  PlusIcon,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { AssistantsTable } from "@app/components/assistant/manager/AssistantsTable";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
} from "@app/lib/utils";
import Custom404 from "@app/pages/404";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import { isAdmin } from "@app/types/user";

export const AGENT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  {
    id: "all_custom",
    label: "All",
    description: "All custom agents.",
  },
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Edited or created by you.",
  },
  {
    id: "global",
    label: "Default",
    description: "Default agents provided by Dust.",
  },
  {
    id: "archived",
    label: "Archived",
    description: "Archived agents.",
  },
  {
    id: "search",
    label: "Active",
    icon: MagnifyingGlassIcon,
    description: "Active agents matching your search",
  },
  {
    id: "search_archived",
    label: "Archived",
    icon: MagnifyingGlassIcon,
    description: "Archived agents matching your search",
  },
] as const;

export type AssistantManagerTabsType =
  (typeof AGENT_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is AssistantManagerTabsType {
  return AGENT_MANAGER_TABS.some((tabItem) => tabItem.id === tab);
}

export function ManageAgentsPage() {
  const owner = useWorkspace();
  const { user, isBuilder } = useAuth();
  const [assistantSearch, setAssistantSearch] = useState("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [isBatchEdit, setIsBatchEdit] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") && !isBuilder;
  const shouldDisableAgentFetching =
    isFeatureFlagsLoading || isRestrictedFromAgentCreation;
  const isSearchActive = assistantSearch.trim() !== "";

  const [selectedSearchTab, setSelectedSearchTab] = useState<
    "search" | "search_archived"
  >("search");

  const activeTab = useMemo(() => {
    if (isSearchActive) {
      return selectedSearchTab;
    }

    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all_custom";
  }, [isSearchActive, selectedTab, selectedSearchTab]);

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "manage",
    includes: ["authors", "usage", "feedbacks", "editors"],
    disabled: shouldDisableAgentFetching,
  });

  const selectedAgents = agentConfigurations.filter((a) =>
    selection.includes(a.sId)
  );

  const {
    agentConfigurations: archivedAgentConfigurations,
    isAgentConfigurationsLoading: isArchivedAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "archived",
    includes: ["usage", "feedbacks", "editors"],
    disabled:
      shouldDisableAgentFetching ||
      (selectedTab !== "archived" && !isSearchActive),
  });

  const agentsByTab = useMemo(() => {
    const selectedTagIds = selectedTags.map((tag) => tag.sId);
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => {
        if (selectedTagIds.length === 0) {
          return true;
        }
        return a.tags.some((t) => selectedTagIds.includes(t.sId));
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const searchLower = assistantSearch.toLowerCase();
    const filterAndSortBySearch = (agents: LightAgentConfigurationType[]) =>
      agents
        .filter((a) => subFilter(searchLower, getAgentSearchString(a)))
        .sort((a, b) =>
          compareForFuzzySort(
            searchLower,
            getAgentSearchString(a),
            getAgentSearchString(b)
          )
        );

    return {
      // do not show the "all" tab while still loading all agents
      all_custom: allAgents.filter((a) => a.scope !== "global"),
      editable_by_me: allAgents.filter((a) => a.canEdit),
      global: allAgents.filter((a) => a.scope === "global"),
      archived: archivedAgentConfigurations.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      ),
      search: filterAndSortBySearch(agentConfigurations),
      search_archived: filterAndSortBySearch(archivedAgentConfigurations),
    };
  }, [
    agentConfigurations,
    archivedAgentConfigurations,
    selectedTags,
    assistantSearch,
  ]);

  const { uniqueTags } = useMemo(() => {
    const tags = agentConfigurations.flatMap((a) => a.tags);
    // Remove duplicate tags by unique sId
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.sId, tag])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    return { uniqueTags };
  }, [agentConfigurations]);

  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
    if (agent.status === "disabled_free_workspace") {
      setShowDisabledFreeWorkspacePopup(agent.sId);
      return;
    }
    const res = await clientFetch(
      `/api/w/${owner.sId}/assistant/global_agents/${agent.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status:
            agent.status === "disabled_by_admin"
              ? "active"
              : "disabled_by_admin",
        }),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      window.alert(`Error toggling agent: ${data.error.message}`);
      return;
    }

    await mutateAgentConfigurations();
  };

  // if search is active, show search tabs, otherwise show all tabs except search tabs
  const visibleTabs = useMemo(() => {
    const searchTab = AGENT_MANAGER_TABS.find((tab) => tab.id === "search");
    const searchArchivedTab = AGENT_MANAGER_TABS.find(
      (tab) => tab.id === "search_archived"
    );
    if (!searchTab || !searchArchivedTab) {
      throw new Error("Unexpected: Search tabs not found");
    }

    return isSearchActive
      ? [searchTab, searchArchivedTab]
      : AGENT_MANAGER_TABS.filter(
          (tab) => tab.id !== "search" && tab.id !== "search_archived"
        );
  }, [isSearchActive]);

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isFeatureFlagsLoading || isRestrictedFromAgentCreation) {
      return;
    }
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        if (searchBarRef.current) {
          searchBarRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [isFeatureFlagsLoading, isRestrictedFromAgentCreation]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  return (
    <>
      {isFeatureFlagsLoading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isRestrictedFromAgentCreation ? (
        <Custom404 />
      ) : (
        <>
          <AgentDetails
            owner={owner}
            user={user}
            agentId={detailedAgentId}
            onClose={() => setDetailedAgentId(null)}
          />
          <div className="flex w-full flex-col gap-8 pb-4 pt-2 lg:pt-8">
            <Page.Header title="Manage Agents" icon={ContactsRobotIcon} />
            <Page.Vertical gap="md" align="stretch">
              <div className="flex flex-row gap-2">
                <SearchInput
                  ref={searchBarRef}
                  className="flex-grow"
                  name="search"
                  placeholder="Search (Name, Editors)"
                  value={assistantSearch}
                  onChange={(s: string) => {
                    setAssistantSearch(s);
                  }}
                />
                {!isBatchEdit && (
                  <div className="flex gap-2">
                    {isAdmin(owner) && (
                      <Button
                        variant="outline"
                        icon={ListSelectIcon}
                        label="Batch edit"
                        onClick={() => {
                          setIsBatchEdit(true);
                        }}
                      />
                    )}

                    <TagsFilterMenu
                      tags={uniqueTags}
                      selectedTags={selectedTags}
                      setSelectedTags={setSelectedTags}
                      owner={owner}
                    />
                    {!isRestrictedFromAgentCreation && (
                      <CreateDropdown
                        owner={owner}
                        dataGtmLocation="assistantsWorkspace"
                      />
                    )}
                  </div>
                )}
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-row gap-2">
                  {selectedTags.map((tag) => (
                    <Chip
                      key={tag.sId}
                      label={tag.name}
                      size="xs"
                      color="golden"
                      onRemove={() =>
                        setSelectedTags(selectedTags.filter((t) => t !== tag))
                      }
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-col pt-3">
                {isBatchEdit ? (
                  <AgentEditBar
                    onClose={() => {
                      setIsBatchEdit(false);
                      setSelection([]);
                    }}
                    owner={owner}
                    selectedAgents={selectedAgents}
                    tags={uniqueTags}
                    mutateAgentConfigurations={mutateAgentConfigurations}
                  />
                ) : (
                  <Tabs value={activeTab}>
                    <TabsList>
                      {visibleTabs.map((tab) => (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          label={tab.label}
                          onClick={() => {
                            if (isSearchActive) {
                              if (
                                tab.id === "search" ||
                                tab.id === "search_archived"
                              ) {
                                setSelectedSearchTab(tab.id);
                              }
                            } else {
                              setSelectedTab(tab.id);
                            }
                          }}
                          tooltip={
                            AGENT_MANAGER_TABS.find((t) => t.id === tab.id)
                              ?.description
                          }
                          isCounter={
                            tab.id !== "archived" &&
                            tab.id !== "search_archived"
                          }
                          counterValue={`${agentsByTab[tab.id].length}`}
                        />
                      ))}
                    </TabsList>
                  </Tabs>
                )}
                {isAgentConfigurationsLoading ||
                isArchivedAgentConfigurationsLoading ? (
                  <div className="mt-8 flex justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : activeTab && agentsByTab[activeTab] ? (
                  <AssistantsTable
                    isBatchEdit={isBatchEdit}
                    selection={selection}
                    setSelection={setSelection}
                    owner={owner}
                    agents={agentsByTab[activeTab]}
                    setDetailedAgentId={setDetailedAgentId}
                    handleToggleAgentStatus={handleToggleAgentStatus}
                    showDisabledFreeWorkspacePopup={
                      showDisabledFreeWorkspacePopup
                    }
                    setShowDisabledFreeWorkspacePopup={
                      setShowDisabledFreeWorkspacePopup
                    }
                    mutateAgentConfigurations={mutateAgentConfigurations}
                  />
                ) : (
                  !assistantSearch &&
                  !isRestrictedFromAgentCreation && (
                    <div className="pt-2">
                      <EmptyCallToAction
                        href={`/w/${owner.sId}/builder/agents/create`}
                        label="Create an agent"
                        icon={PlusIcon}
                        data-gtm-label="assistantCreationButton"
                        data-gtm-location="assistantsWorkspace"
                      />
                    </div>
                  )
                )}
              </div>
            </Page.Vertical>
          </div>
        </>
      )}
    </>
  );
}
