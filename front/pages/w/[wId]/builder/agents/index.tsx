import {
  Button,
  Chip,
  DIcon,
  ListSelectIcon,
  MagnifyingGlassIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { CreateAgentButton } from "@app/components/assistant/CreateAgentButton";
import { AssistantDetails } from "@app/components/assistant/details/AssistantDetails";
import { AssistantsTable } from "@app/components/assistant/manager/AssistantsTable";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { useHashParam } from "@app/hooks/useHashParams";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
} from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

export const AGENT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  {
    id: "all_custom",
    label: "All",
    icon: RobotIcon,
    description: "All custom agents.",
  },
  {
    id: "editable_by_me",
    label: "Editable by me",
    icon: PencilSquareIcon,
    description: "Edited or created by you.",
  },
  {
    id: "global",
    label: "Default",
    icon: DIcon,
    description: "Default agents provided by Dust.",
  },
  {
    id: "archived",
    label: "Archived",
    icon: TrashIcon,
    description: "Archived agents.",
  },
  {
    id: "search",
    label: "Searching across all agents",
    icon: MagnifyingGlassIcon,
    description: "Searching across all agents",
  },
] as const;

export type AssistantManagerTabsType =
  (typeof AGENT_MANAGER_TABS)[number]["id"];

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  const user = auth.getNonNullableUser();

  return {
    props: {
      owner,
      subscription,
      user: user.toJSON(),
    },
  };
});

function isValidTab(tab: string): tab is AssistantManagerTabsType {
  return AGENT_MANAGER_TABS.map((tab) => tab.id).includes(
    tab as AssistantManagerTabsType
  );
}

export default function WorkspaceAssistants({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [assistantSearch, setAssistantSearch] = useState("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [isBatchEdit, setIsBatchEdit] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  const activeTab = useMemo(() => {
    if (assistantSearch.trim() !== "") {
      return "search";
    }

    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all_custom";
  }, [assistantSearch, selectedTab]);

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
    disabled: selectedTab !== "archived",
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

    return {
      // do not show the "all" tab while still loading all agents
      all_custom: allAgents.filter((a) => a.scope !== "global"),
      editable_by_me: allAgents.filter((a) => a.canEdit),
      global: allAgents.filter((a) => a.scope === "global"),
      archived: archivedAgentConfigurations.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      ),
      search: agentConfigurations
        .filter(
          (a) =>
            a.status === "active" &&
            // Filters on search query
            subFilter(assistantSearch.toLowerCase(), getAgentSearchString(a))
        )
        .sort((a, b) => {
          return compareForFuzzySort(
            assistantSearch,
            getAgentSearchString(a),
            getAgentSearchString(b)
          );
        }),
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

  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
    if (agent.status === "disabled_free_workspace") {
      setShowDisabledFreeWorkspacePopup(agent.sId);
      return;
    }
    const res = await fetch(
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

  // if search is active, only show the search tab, otherwise show all tabs with agents except the search tab
  const visibleTabs = useMemo(() => {
    const searchTab = AGENT_MANAGER_TABS.find((tab) => tab.id === "search");
    if (!searchTab) {
      throw new Error("Unexpected: Search tab not found");
    }

    return assistantSearch.trim() !== ""
      ? [searchTab]
      : AGENT_MANAGER_TABS.filter((tab) => tab.id !== "search");
  }, [assistantSearch]);

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBarRef.current]);

  useEffect(() => {
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
  }, []);

  return (
    <ConversationsNavigationProvider>
      <AppWideModeLayout
        subscription={subscription}
        owner={owner}
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <AssistantDetails
          owner={owner}
          user={user}
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          assistantId={showDetails?.sId || null}
          onClose={() => setShowDetails(null)}
        />
        <div className="flex w-full flex-col gap-8 pt-2 lg:pt-8">
          <Page.Header title="Manage Agents" icon={RobotIcon} />
          <Page.Vertical gap="md" align="stretch">
            <div className="flex flex-row gap-2">
              <SearchInput
                ref={searchBarRef}
                className="flex-grow"
                name="search"
                placeholder="Search (Name, Editors)"
                value={assistantSearch}
                onChange={(s) => {
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
                    <CreateAgentButton
                      owner={owner}
                      dataGtmLocation="assistantsWorkspace"
                    />
                  )}
                </div>
              )}
            </div>
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
                        onClick={() =>
                          !assistantSearch && setSelectedTab(tab.id)
                        }
                        tooltip={
                          AGENT_MANAGER_TABS.find((t) => t.id === tab.id)
                            ?.description
                        }
                        icon={
                          AGENT_MANAGER_TABS.find((t) => t.id === tab.id)?.icon
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
                  setShowDetails={setShowDetails}
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
      </AppWideModeLayout>
    </ConversationsNavigationProvider>
  );
}

WorkspaceAssistants.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
