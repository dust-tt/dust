import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { AssistantsTable } from "@app/components/assistant/manager/AssistantsTable";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
} from "@app/lib/utils";
import Custom404 from "@app/pages/404";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Chip,
  ContactsRobot,
  ListSelect,
  Page,
  Plus,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

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

  const { featureFlags } = useFeatureFlags();

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") && !isBuilder;
  const shouldDisableAgentFetching = isRestrictedFromAgentCreation;
  const isSearchActive = assistantSearch.trim() !== "";

  const activeTab = useMemo(() => {
    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all_custom";
  }, [selectedTab]);

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
    disabled: shouldDisableAgentFetching || selectedTab !== "archived",
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
    const filteredList = (agents: LightAgentConfigurationType[]) => {
      if (!isSearchActive) {
        return agents;
      }
      return agents
        .filter((a) => subFilter(searchLower, getAgentSearchString(a)))
        .sort((a, b) =>
          compareForFuzzySort(
            searchLower,
            getAgentSearchString(a),
            getAgentSearchString(b)
          )
        );
    };

    return {
      all_custom: filteredList(allAgents.filter((a) => a.scope !== "global")),
      editable_by_me: filteredList(allAgents.filter((a) => a.canEdit)),
      global: filteredList(allAgents.filter((a) => a.scope === "global")),
      archived: filteredList(
        archivedAgentConfigurations.sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        )
      ),
    };
  }, [
    agentConfigurations,
    archivedAgentConfigurations,
    selectedTags,
    assistantSearch,
    isSearchActive,
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

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isRestrictedFromAgentCreation) {
      return;
    }
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        searchBarRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [isRestrictedFromAgentCreation]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  return (
    <>
      {isRestrictedFromAgentCreation ? (
        <Custom404 />
      ) : (
        <>
          <AgentDetailsSheet
            owner={owner}
            user={user}
            agentId={detailedAgentId}
            onClose={() => setDetailedAgentId(null)}
          />
          <div className="flex w-full flex-col gap-8 pb-4">
            <Page.Header title="Manage Agents" icon={ContactsRobot} />
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
                        icon={ListSelect}
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
                      {AGENT_MANAGER_TABS.map((tab) => (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          label={tab.label}
                          onClick={() => {
                            setSelectedTab(tab.id);
                          }}
                          tooltip={
                            AGENT_MANAGER_TABS.find((t) => t.id === tab.id)
                              ?.description
                          }
                          isCounter={tab.id !== "archived"}
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
                        icon={Plus}
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
