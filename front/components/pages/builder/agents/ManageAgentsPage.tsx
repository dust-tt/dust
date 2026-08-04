import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { Cartography } from "@app/components/assistant/conversation/agent_browser/cartography/Cartography";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type { AgentModelFilterType } from "@app/components/assistant/ModelsFilterMenu";
import { ModelsFilterMenu } from "@app/components/assistant/ModelsFilterMenu";
import { AssistantsTable } from "@app/components/assistant/manager/AssistantsTable";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import Custom404 from "@app/components/pages/Custom404";
import { getModelLogoByModelId } from "@app/components/providers/types";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
} from "@app/lib/utils";
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
  {
    id: "cartography",
    label: "Cartography",
    description: "Visual map of your agents.",
  },
] as const;

export type AssistantManagerTabsType =
  (typeof AGENT_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is AssistantManagerTabsType {
  return AGENT_MANAGER_TABS.some((tabItem) => tabItem.id === tab);
}

export function ManageAgentsPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const [assistantSearch, setAssistantSearch] = useState("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [selectedModels, setSelectedModels] = useState<AgentModelFilterType[]>(
    []
  );
  const [isBatchEdit, setIsBatchEdit] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const { isDark } = useTheme();

  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");
  const canPublishAgent = hasPermission("publish", "agent");
  // Users who can publish agents can view the page to discover existing agents
  // and identify the ones they can edit, even without create permission.
  const canManageAgents = canCreateAgent || canPublishAgent;
  const shouldDisableAgentFetching = !canManageAgents;
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
    const selectedTagIds = new Set(selectedTags.map((tag) => tag.sId));
    const selectedModelIds = new Set(
      selectedModels.map((model) => model.modelId)
    );
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => {
        if (
          selectedTagIds.size > 0 &&
          !a.tags.some((t) => selectedTagIds.has(t.sId))
        ) {
          return false;
        }
        if (
          selectedModelIds.size > 0 &&
          !selectedModelIds.has(a.model.modelId)
        ) {
          return false;
        }
        return true;
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
      cartography: [],
    };
  }, [
    agentConfigurations,
    archivedAgentConfigurations,
    selectedTags,
    selectedModels,
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

  const uniqueModels = useMemo(() => {
    // Agents pointing at a model we no longer support fall back to their raw
    // modelId, as the Model column of the agents table does.
    const models = agentConfigurations.map((a) => ({
      modelId: a.model.modelId,
      displayName:
        getSupportedModelConfig(a.model)?.displayName ?? a.model.modelId,
    }));
    // Remove duplicate models by unique modelId.
    return Array.from(
      new Map(models.map((model) => [model.modelId, model])).values()
    ).sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    if (!canManageAgents) {
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
  }, [canManageAgents]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  return (
    <>
      {!canManageAgents ? (
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

                    <ModelsFilterMenu
                      models={uniqueModels}
                      selectedModels={selectedModels}
                      setSelectedModels={setSelectedModels}
                    />
                    <TagsFilterMenu
                      tags={uniqueTags}
                      selectedTags={selectedTags}
                      setSelectedTags={setSelectedTags}
                      owner={owner}
                    />
                    {canCreateAgent && (
                      <CreateDropdown
                        owner={owner}
                        dataGtmLocation="assistantsWorkspace"
                      />
                    )}
                  </div>
                )}
              </div>
              {(selectedModels.length > 0 || selectedTags.length > 0) && (
                <div className="flex flex-row flex-wrap gap-2">
                  {selectedModels.map((model) => (
                    <Chip
                      key={model.modelId}
                      label={model.displayName}
                      size="xs"
                      color="primary"
                      icon={getModelLogoByModelId(model.modelId, isDark)}
                      onRemove={() =>
                        setSelectedModels(
                          selectedModels.filter(
                            (m) => m.modelId !== model.modelId
                          )
                        )
                      }
                    />
                  ))}
                  {selectedTags.map((tag) => (
                    <Chip
                      key={tag.sId}
                      label={tag.name}
                      size="xs"
                      color="info"
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
                          isCounter={
                            tab.id !== "archived" && tab.id !== "cartography"
                          }
                          counterValue={`${agentsByTab[tab.id]?.length ?? 0}`}
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
                ) : activeTab === "cartography" ? (
                  <Cartography
                    owner={owner}
                    agentConfigurations={agentsByTab.all_custom}
                    isLoading={isAgentConfigurationsLoading}
                    onAgentClick={(agent) => setDetailedAgentId(agent.sId)}
                  />
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
                  canCreateAgent && (
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
