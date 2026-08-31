import { CreateDropdown } from "@app/components/assistant/CreateDropdown";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type { AgentModelFilterType } from "@app/components/assistant/ModelsFilterMenu";
import { ModelsFilterMenu } from "@app/components/assistant/ModelsFilterMenu";
import { AssistantsTable } from "@app/components/assistant/manager/AssistantsTable";
import { NoArchivedAgentsCTA } from "@app/components/assistant/manager/NoArchivedAgentsCTA";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { getModelLogoByModelId } from "@app/components/providers/types";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
} from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import {
  Checkbox,
  Chip,
  EmptyCTA,
  InfoCircle,
  Page,
  Plus,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
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
  const { user, isAdmin } = useAuth();
  const [assistantSearch, setAssistantSearch] = useState("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [selectedModels, setSelectedModels] = useState<AgentModelFilterType[]>(
    []
  );
  const [selection, setSelection] = useState<string[]>([]);
  const [showHiddenAgents, setShowHiddenAgents] = useState(false);
  const isMobile = useIsMobile();

  const { isDark } = useTheme();

  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");
  // Only admins may list the agents they neither edit nor share a space with.
  const canShowHiddenAgents = isAdmin;
  const isShowHiddenAgentsEnabled = canShowHiddenAgents && showHiddenAgents;
  const isSearchActive = assistantSearch.trim() !== "";
  const isFilterActive =
    isSearchActive || selectedTags.length > 0 || selectedModels.length > 0;

  const activeTab = useMemo(() => {
    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all_custom";
  }, [selectedTab]);

  // The selection is scoped to the current tab/search/filter combination: an agent that drops
  // out of view (tab switch, search, or filter change) should drop out of the selection too.
  const selectionScopeKey = [
    activeTab,
    assistantSearch,
    String(isShowHiddenAgentsEnabled),
    selectedTags
      .map((t) => t.sId)
      .sort()
      .join(","),
    selectedModels
      .map((m) => m.modelId)
      .sort()
      .join(","),
  ].join("|");
  const [prevSelectionScopeKey, setPrevSelectionScopeKey] =
    useState(selectionScopeKey);
  if (selectionScopeKey !== prevSelectionScopeKey) {
    setPrevSelectionScopeKey(selectionScopeKey);
    setSelection([]);
  }

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: isShowHiddenAgentsEnabled ? "manage_unrestricted" : "manage",
    includes: ["authors", "usage", "feedbacks", "editors"],
  });

  const {
    agentConfigurations: archivedAgentConfigurations,
    isAgentConfigurationsLoading: isArchivedAgentConfigurationsLoading,
    mutateRegardlessOfQueryParams: mutateArchivedAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "archived",
    includes: ["usage", "feedbacks", "editors"],
    disabled: selectedTab !== "archived",
  });

  const agentsByTab = useMemo(() => {
    const selectedTagIds = new Set(selectedTags.map((tag) => tag.sId));
    const selectedModelIds = new Set(
      selectedModels.map((model) => model.modelId)
    );
    const matchesFilters = (a: LightAgentConfigurationType) => {
      if (
        selectedTagIds.size > 0 &&
        !a.tags.some((t) => selectedTagIds.has(t.sId))
      ) {
        return false;
      }
      if (selectedModelIds.size > 0 && !selectedModelIds.has(a.model.modelId)) {
        return false;
      }
      return true;
    };
    const byName = (
      a: LightAgentConfigurationType,
      b: LightAgentConfigurationType
    ) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter(matchesFilters)
      .sort(byName);

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
        archivedAgentConfigurations.filter(matchesFilters).sort(byName)
      ),
    };
  }, [
    agentConfigurations,
    archivedAgentConfigurations,
    selectedTags,
    selectedModels,
    assistantSearch,
    isSearchActive,
  ]);

  // Archived agents are filtered like the others, so both filters must offer
  // what they are on too.
  const listedAgents = useMemo(
    () => [...agentConfigurations, ...archivedAgentConfigurations],
    [agentConfigurations, archivedAgentConfigurations]
  );

  const usedModelIds = useMemo(
    () => Array.from(new Set(listedAgents.map((a) => a.model.modelId))).sort(),
    [listedAgents]
  );

  const { uniqueTags } = useMemo(() => {
    const tags = listedAgents.flatMap((a) => a.tags);
    // Remove duplicate tags by unique sId
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.sId, tag])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    return { uniqueTags };
  }, [listedAgents]);

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
  }, []);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  const isLoading =
    isAgentConfigurationsLoading || isArchivedAgentConfigurationsLoading;

  return (
    <>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={detailedAgentId}
        onClose={() => setDetailedAgentId(null)}
      />
      <div className="flex w-full flex-col gap-8 pb-4">
        <Page.Header title="Manage Agents" noTopPadding />
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
            <div className="flex gap-2">
              <ModelsFilterMenu
                owner={owner}
                modelIds={usedModelIds}
                selectedModels={selectedModels}
                setSelectedModels={setSelectedModels}
                isCompact={isMobile}
              />
              <TagsFilterMenu
                tags={uniqueTags}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                owner={owner}
                isCompact={isMobile}
              />
              {canCreateAgent && (
                <CreateDropdown
                  owner={owner}
                  dataGtmLocation="assistantsWorkspace"
                  isCompact={isMobile}
                />
              )}
            </div>
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
                      selectedModels.filter((m) => m.modelId !== model.modelId)
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
                {canShowHiddenAgents && activeTab === "all_custom" && (
                  <span className="ml-auto flex gap-1 self-center text-sm text-muted-foreground">
                    <label className="flex cursor-pointer flex-row items-center gap-2 whitespace-nowrap">
                      <Checkbox
                        checked={showHiddenAgents}
                        onCheckedChange={(checked) =>
                          setShowHiddenAgents(checked === true)
                        }
                      />
                      Show hidden agents
                    </label>
                    <Tooltip
                      label="Shows the agents of all members you can access as an admin, even if they are not published or if they use restricted spaces"
                      trigger={
                        <InfoCircle className="h-4 w-4 text-muted-foreground" />
                      }
                    />
                  </span>
                )}
              </TabsList>
            </Tabs>
            {isLoading || agentsByTab[activeTab].length > 0 ? (
              <AssistantsTable
                selection={selection}
                setSelection={setSelection}
                owner={owner}
                agents={agentsByTab[activeTab]}
                setDetailedAgentId={setDetailedAgentId}
                handleToggleAgentStatus={handleToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
                mutateAgentConfigurations={mutateAgentConfigurations}
                isLoading={isLoading}
              />
            ) : isFilterActive ? (
              <div className="pt-2">
                <EmptyCTA
                  message="No agent matches your search or filters."
                  action={null}
                />
              </div>
            ) : activeTab === "archived" ? (
              <div className="pt-2">
                <NoArchivedAgentsCTA
                  owner={owner}
                  onArchived={() => {
                    void mutateArchivedAgentConfigurations();
                  }}
                />
              </div>
            ) : (
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
  );
}
